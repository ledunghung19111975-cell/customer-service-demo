# V2 安装与回退

本地集成 Agent：Codex。当前默认版本及构建测试方式见 [项目 README](README.md)。

本目录包含完整项目。`apply_v2.py` 用于把清单中的 V2 文件覆盖层应用到已核验的 `eacb812` 原仓库；它完整预检、备份原入口为 `ecommerce-v1.html`，最后切换入口。不同内容的新增文件或未经识别的入口会停止写入。

```bash
python3 apply_v2.py "/path/to/customer-service-demo" --dry-run
python3 apply_v2.py "/path/to/customer-service-demo"
python3 apply_v2.py "/path/to/customer-service-demo" --restore-entry
```

恢复入口保留 V2 文件和两版浏览器记录。不得在应用期间同时修改目标目录。恢复旧入口后，`build_v2.py` 会拒绝构建；切回 V2 后再生成。`build_single.py` 构建当前默认入口。

`changes-v2.patch` 是原始附件的文本审阅材料，涵盖附件最初交付范围；当前本地代码以 `src/v2/`、本地提交及 `MANIFEST.sha256` 为准。安装清单 `V2_MANIFEST.json` 校验本地 V2 覆盖层，完整集成说明与旧入口回归配置在项目 README 中维护。安装器不提交或推送 Git。
