#!/usr/bin/env python3
"""Apply the V2 overlay without deleting or modifying original runtime modules.

Uses only the Python standard library. Preflights the complete payload, backs up
index.html, writes the new entry last, and rolls back writes on an exception.
A changed/unrecognized entry or conflicting new file is never force-overwritten.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile

BASE_INDEX_SHA = 'caafe182e130c60e70266a4ce9f0e613390e18cd'
BACKUP = 'ecommerce-v1.html'
MANIFEST = 'V2_MANIFEST.json'

def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()

def is_base(data: bytes) -> bool:
    # Git may check a Windows worktree out using CRLF; preserve its actual bytes.
    return blob_sha(data.replace(b'\r\n', b'\n')) == BASE_INDEX_SHA

def safe_path(root: Path, name: str) -> Path:
    rel = PurePosixPath(name)
    if not name or rel.is_absolute() or '..' in rel.parts or '\\' in name or '.git' in rel.parts:
        raise ValueError(f'不安全的相对路径：{name}')
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError(f'拒绝写入符号链接：{path}')
    if path.exists() and not path.is_file():
        raise ValueError(f'目标不是普通文件：{path}')
    return path

def payload(root: Path) -> dict[str, bytes]:
    manifest = json.loads((root / MANIFEST).read_text(encoding='utf-8'))
    entries = manifest.get('files')
    if not isinstance(entries, dict) or 'index.html' not in entries:
        raise ValueError('改动包清单不完整')
    result: dict[str, bytes] = {}
    for name, expected in entries.items():
        data = safe_path(root, name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f'改动包内容与清单不一致：{name}')
        result[name] = data
    result[MANIFEST] = (root / MANIFEST).read_bytes()
    return result

def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.v2-write-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def apply(package: Path, target: Path, *, dry_run: bool = False, restore_entry: bool = False) -> list[str]:
    package, target = package.resolve(), target.resolve()
    if not target.is_dir() or target == package:
        raise ValueError('请指定原仓库目录，不要指定改动包自身或不存在的目录')
    data = payload(package)
    index, backup = safe_path(target, 'index.html'), safe_path(target, BACKUP)
    if not index.exists():
        raise ValueError('目标目录缺少 index.html，未进行修改')
    before, new = index.read_bytes(), data['index.html']
    if restore_entry:
        if not backup.exists() or not is_base(backup.read_bytes()):
            raise ValueError('没有可核验的原入口备份，拒绝恢复')
        if before != new and not is_base(before):
            raise ValueError('当前入口已被另行修改，拒绝覆盖')
        if not dry_run:
            atomic_write(index, backup.read_bytes())
        return ['恢复 index.html；V2 文件和两版浏览器数据均保留']
    if before != new and not is_base(before):
        raise ValueError('目标入口不是核对过的 eacb812 版本，也不是本包 V2；未进行修改')
    if backup.exists():
        if not is_base(backup.read_bytes()):
            raise ValueError('ecommerce-v1.html 已存在且不是已核验原入口，拒绝覆盖')
    elif before == new:
        raise ValueError('检测到 V2 入口但原入口备份缺失，请核查备份后再应用')
    for name, content in data.items():
        path = safe_path(target, name)
        if name != 'index.html' and path.exists() and path.read_bytes() != content:
            raise ValueError(f'发现同名但内容不同的文件，未进行任何修改：{name}')
    operations: list[tuple[Path, bytes]] = []
    if not backup.exists():
        operations.append((backup, before))
    for name, content in data.items():
        if name == 'index.html':
            continue
        path = safe_path(target, name)
        if not path.exists():
            operations.append((path, content))
    if before != new:
        operations.append((index, new))  # Only switch the entry after the complete payload exists.
    descriptions = [str(path.relative_to(target)) for path, _ in operations]
    if dry_run:
        return descriptions or ['无需修改：内容已是本包版本']
    written: list[tuple[Path, bytes | None]] = []
    try:
        for path, content in operations:
            old = path.read_bytes() if path.exists() else None
            written.append((path, old))
            atomic_write(path, content)
    except Exception:
        for path, old in reversed(written):
            if old is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, old)
        raise
    return descriptions or ['无需修改：内容已是本包版本']

def main() -> int:
    parser = argparse.ArgumentParser(description='校验并应用电商客服V2改动包；不提交Git、不删除旧源码。')
    parser.add_argument('repository', type=Path, help='本地原仓库目录')
    parser.add_argument('--dry-run', action='store_true', help='仅核对和列出改动，不写文件')
    parser.add_argument('--restore-entry', action='store_true', help='恢复原入口，保留新增文件和浏览器数据')
    args = parser.parse_args()
    try:
        names = apply(Path(__file__).resolve().parent, args.repository,
                      dry_run=args.dry_run, restore_entry=args.restore_entry)
        print('校验完成，以下仅为计划：' if args.dry_run else '本地文件处理完成：')
        print('\n'.join('  ' + name for name in names))
        print('未修改Git历史，未向GitHub推送。原入口备份：ecommerce-v1.html。')
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f'操作中止：{exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
