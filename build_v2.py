#!/usr/bin/env python3
"""Build a single offline page from the V2 sources; no external assets required."""
from pathlib import Path
import re

def build(root: Path) -> Path:
    html = (root / 'index.html').read_text(encoding='utf-8')
    if 'src/v2/app.js' not in html:
        raise ValueError('默认入口未加载 V2；请切回 V2 后构建，现有产物未改写。')
    scripts = re.findall(r'<script src="([^"]+)" defer></script>', html)
    html = re.sub(r'^[ \t]*<script src="[^"]+" defer></script>[ \t]*\n?', '', html, flags=re.M)
    for path in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
        html = html.replace(f'<link rel="stylesheet" href="{path}">', '<style>\n' + (root/path).read_text(encoding='utf-8') + '\n</style>')
    bundle='\n'.join('<script>\n'+(root/path).read_text(encoding='utf-8').replace('</script', '<\\/script')+'\n</script>' for path in scripts)
    html=html.replace('</body>', bundle+'\n</body>')
    output=root/'dist'/'智能客服_V2.html'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding='utf-8')
    return output

if __name__ == '__main__':
    print(build(Path(__file__).resolve().parent))
