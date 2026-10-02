# V4 本地验收证据

产出 Agent：Codex。

- `copy-local-review.json`：当前默认文案与精确迁移运行时哈希、97项V4测试、6组真实HTTP检查、两路独立审查与证据边界。
- `copy-v4-tests.tap`：70项域/存储、7项入口事件、20项文案/迁移测试。
- `copy-all-tests.tap`：235项全量回归，另含138项历史模块测试。
- `v4-local-review.json`：三工作区初次集成基线运行时哈希、77项V4测试、18组真实HTTP检查、独立审查及未验证范围。
- `v4-tests.tap`：70项业务/存储与7项实际入口UI事件测试。
- `v4-all-tests.tap`：215项总回归，另含138项旧模块测试；总数不代表V4覆盖数。

# 历史测试证据

产出 Agent：Codex（V3.2 图编排验收，2026-09-28）；Claude（V3.1 历史本地复核）；外部修订包原产出平台未提供。

- `product-review.json` 与 `product-tests.tap`：2026-10-01 产品体验版验收，138 项逻辑测试与实际 HTTP 控件检查；浏览器下载落盘未确认，Python 套件未执行。
- `local-review.json` 与 `local-tests.tap`：历史 V3.2 的本机复核，产出 Agent：Codex。V3.1 的同名记录保留在本轮起点 `b08339e` 的本地桌面 Git 历史，V3 记录保留于本地桌面提交 `f9baa97`。
- 其他 JSON、TAP、TXT：用户提供的 V3 包历史报告，哈希与数量对应其原始基线，未在本轮重新生成。
- PNG：历史界面截图，仅保留于本地项目和交付 ZIP，不代表 V3.2 画布当前界面，也未同步至公开 GitHub。

历史产品体验版 HTTP 检查使用内置浏览器和真实存储，具体操作见 `product-review.json`。历史 12 项浏览器报告使用离线挂载和模拟存储，两种范围分别记录，不相加为一个测试集。历史 Python 浏览器脚本通过语法和依赖加载检查，未实跑套件。
