# T-151 第 1 棒执行记录

产出 Agent：Codex；代码主写与收敛：Codex；分棒验收：Claude（待复验）。

日志保留完整文本；仅清除空白行缩进以通过 Git 空白检查，未格式化原始 TAP 另存于文中列出的 `/tmp` 路径。

## 开工回执（2026-10-05）
- 目标：仅修复 F1、F8，使 S2-1、S2-1b、S8-1a、S5-1、S5-1c 符合。
- 基线：HEAD `25c2ff7`，项目工作区干净；全量 297 通过、0 失败、0 跳过。
- 固定复现：缺陷 49 项不符合；对照 17 项符合；脚本 SHA256 前 12 位 `261d589425b1`。
- 顺序：新增失败用例 → F1 → F8 → 撤修反证 → 全量/复现 → 页面 → 两路只读审查 → 构建与提交。
- 最大风险：混合业务问句被寒暄吞掉、已完成结果被关闭处置覆盖；保留原业务路径与结果快照。
- 隔离：页面使用 8769 独立测试环境；不操作 8768 日常数据；不推送。
- 基线原始输出：`/tmp/T151-baseline-tests.tap`、`/tmp/T151-baseline-repro.txt`；MANIFEST 76 项全部 OK。

## 进度

- [x] 任务 0：基线核对一致。
- [x] 任务 1：F1 寒暄路由及反向验证。
- [x] 任务 2：F8 关闭完整性及反向验证。
- [x] 任务 3：页面、独立审查、构建与校验；提交凭证见工作记录。

## 新增用例：原实现红灯

命令：`node --test --test-reporter=tap tests/t151-p0.test.cjs`（退出码 1）。32 项，8 通过、24 失败、0 跳过。首次页面夹具的视图参数错误已修正；再次运行因残留事项断言失败，未修改既有测试或 helper。

```text
TAP version 13
# Subtest: F1 pure social: 你好
not ok 1 - F1 pure social: 你好
  ---
  duration_ms: 8.016083
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
# Subtest: F1 pure social: 在吗
not ok 2 - F1 pure social: 在吗
  ---
  duration_ms: 0.235708
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
# Subtest: F1 pure social: 谢谢
not ok 3 - F1 pure social: 谢谢
  ---
  duration_ms: 0.484958
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 好的
not ok 4 - F1 pure social: 好的
  ---
  duration_ms: 0.185417
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 您好！
not ok 5 - F1 pure social: 您好！
  ---
  duration_ms: 0.198042
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 谢谢你，辛苦了。
not ok 6 - F1 pure social: 谢谢你，辛苦了。
  ---
  duration_ms: 0.155958
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 嗯嗯，收到
not ok 7 - F1 pure social: 嗯嗯，收到
  ---
  duration_ms: 0.146708
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 明白了
not ok 8 - F1 pure social: 明白了
  ---
  duration_ms: 0.132167
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: OK
not ok 9 - F1 pure social: OK
  ---
  duration_ms: 0.455375
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: hello
not ok 10 - F1 pure social: hello
  ---
  duration_ms: 0.288417
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 您好呀
not ok 11 - F1 pure social: 您好呀
  ---
  duration_ms: 0.186625
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 好的，谢谢您
not ok 12 - F1 pure social: 好的，谢谢您
  ---
  duration_ms: 0.199375
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
ok 13 - F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
  ---
  duration_ms: 0.311166
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
ok 14 - F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
  ---
  duration_ms: 0.131625
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，我要换货 SO20260926001
ok 15 - F1 mixed business preserves routing: 好的，我要换货 SO20260926001
  ---
  duration_ms: 0.335042
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，我要人工
ok 16 - F1 mixed business preserves routing: 你好，我要人工
  ---
  duration_ms: 0.088834
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
ok 17 - F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
  ---
  duration_ms: 0.092125
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
ok 18 - F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
  ---
  duration_ms: 0.117917
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
ok 19 - F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
  ---
  duration_ms: 0.090083
  type: 'test'
  ...
# Subtest: F1 thanks after an answer leaves the result, feedback and issue counts intact
not ok 20 - F1 thanks after an answer leaves the result, feedback and issue counts intact
  ---
  duration_ms: 0.210292
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:32:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:35:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves queued state and existing issues
not ok 21 - F1 social preserves queued state and existing issues
  ---
  duration_ms: 0.311208
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'customer' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'customer'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:43:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves human state and existing issues
not ok 22 - F1 social preserves human state and existing issues
  ---
  duration_ms: 0.259167
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'customer' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'customer'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:43:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves closed state and existing issues
not ok 23 - F1 social preserves closed state and existing issues
  ---
  duration_ms: 1.13675
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'closed'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'closed'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:42:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social keeps pending order collection and does not schedule another AI reply
not ok 24 - F1 social keeps pending order collection and does not schedule another AI reply
  ---
  duration_ms: 0.299458
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:46:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + ''
    - 'SO20260926001'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'SO20260926001'
  actual: ''
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:49:56)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 greetings from multiple customers create no knowledge gaps
not ok 25 - F1 greetings from multiple customers create no knowledge gaps
  ---
  duration_ms: 0.280459
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:53:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    3 !== 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 3
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:55:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 configured handoff still takes precedence over a social phrase
ok 26 - F1 configured handoff still takes precedence over a social phrase
  ---
  duration_ms: 0.096208
  type: 'test'
  ...
# Subtest: F8 completed support has no leftover; closing preserves result and done snapshot without tickets
not ok 27 - F8 completed support has no leftover; closing preserves result and done snapshot without tickets
  ---
  duration_ms: 0.225833
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:62:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'todo' !== 'done'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'done'
  actual: 'todo'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:64:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 public reply confirms the sole issue but an internal note does not
not ok 28 - F8 public reply confirms the sole issue but an internal note does not
  ---
  duration_ms: 0.232833
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:70:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'todo' !== 'done'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'done'
  actual: 'todo'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:74:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 refuses forged na for a completed issue atomically
not ok 29 - F8 refuses forged na for a completed issue atomically
  ---
  duration_ms: 0.406833
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:77:40'
  failureType: 'testCodeFailure'
  error: 'Missing expected exception.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  operator: 'throws'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:79:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 refuses forged withdrawn for a completed issue atomically
not ok 30 - F8 refuses forged withdrawn for a completed issue atomically
  ---
  duration_ms: 0.273292
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:77:40'
  failureType: 'testCodeFailure'
  error: 'Missing expected exception.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  operator: 'throws'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:79:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 completed order is excluded while unfinished issues still require tracked dispositions
not ok 31 - F8 completed order is excluded while unfinished issues still require tracked dispositions
  ---
  duration_ms: 3.099084
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:82:1'
  failureType: 'testCodeFailure'
  error: |-
    The expression evaluated to a falsy value:

      assert.ok(p.items.every(i=>i.caseId===openId))

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:84:66)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
not ok 32 - F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
  ---
  duration_ms: 35.00325
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:88:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    1 !== 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:91:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
1..32
# tests 32
# suites 0
# pass 8
# fail 24
# cancelled 0
# skipped 0
# todo 0
# duration_ms 110.282958
```

## F1 实现及首次绿灯

整句寒暄/致谢/确认在路由层返回固定礼貌答复；人工触发优先，混合业务原路处理。排队、人工、关闭状态不改变；纯寒暄不创建问题，不启动第二次 AI 续答。

命令：`node --test --test-reporter=tap --test-name-pattern="F1 " tests/t151-p0.test.cjs`。

```text
TAP version 13
# Subtest: F1 pure social: 你好
ok 1 - F1 pure social: 你好
  ---
  duration_ms: 8.012917
  type: 'test'
  ...
# Subtest: F1 pure social: 在吗
ok 2 - F1 pure social: 在吗
  ---
  duration_ms: 0.233125
  type: 'test'
  ...
# Subtest: F1 pure social: 谢谢
ok 3 - F1 pure social: 谢谢
  ---
  duration_ms: 1.766041
  type: 'test'
  ...
# Subtest: F1 pure social: 好的
ok 4 - F1 pure social: 好的
  ---
  duration_ms: 0.169917
  type: 'test'
  ...
# Subtest: F1 pure social: 您好！
ok 5 - F1 pure social: 您好！
  ---
  duration_ms: 0.167833
  type: 'test'
  ...
# Subtest: F1 pure social: 谢谢你，辛苦了。
ok 6 - F1 pure social: 谢谢你，辛苦了。
  ---
  duration_ms: 0.126708
  type: 'test'
  ...
# Subtest: F1 pure social: 嗯嗯，收到
ok 7 - F1 pure social: 嗯嗯，收到
  ---
  duration_ms: 0.113792
  type: 'test'
  ...
# Subtest: F1 pure social: 明白了
ok 8 - F1 pure social: 明白了
  ---
  duration_ms: 0.108292
  type: 'test'
  ...
# Subtest: F1 pure social: OK
ok 9 - F1 pure social: OK
  ---
  duration_ms: 0.340167
  type: 'test'
  ...
# Subtest: F1 pure social: hello
ok 10 - F1 pure social: hello
  ---
  duration_ms: 0.160458
  type: 'test'
  ...
# Subtest: F1 pure social: 您好呀
ok 11 - F1 pure social: 您好呀
  ---
  duration_ms: 0.121583
  type: 'test'
  ...
# Subtest: F1 pure social: 好的，谢谢您
ok 12 - F1 pure social: 好的，谢谢您
  ---
  duration_ms: 0.104542
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
ok 13 - F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
  ---
  duration_ms: 0.45375
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
ok 14 - F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
  ---
  duration_ms: 0.132042
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，我要换货 SO20260926001
ok 15 - F1 mixed business preserves routing: 好的，我要换货 SO20260926001
  ---
  duration_ms: 0.294958
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，我要人工
ok 16 - F1 mixed business preserves routing: 你好，我要人工
  ---
  duration_ms: 0.153458
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
ok 17 - F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
  ---
  duration_ms: 0.124333
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
ok 18 - F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
  ---
  duration_ms: 0.099917
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
ok 19 - F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
  ---
  duration_ms: 0.088708
  type: 'test'
  ...
# Subtest: F1 thanks after an answer leaves the result, feedback and issue counts intact
ok 20 - F1 thanks after an answer leaves the result, feedback and issue counts intact
  ---
  duration_ms: 0.215375
  type: 'test'
  ...
# Subtest: F1 social preserves queued state and existing issues
ok 21 - F1 social preserves queued state and existing issues
  ---
  duration_ms: 0.17525
  type: 'test'
  ...
# Subtest: F1 social preserves human state and existing issues
ok 22 - F1 social preserves human state and existing issues
  ---
  duration_ms: 0.213959
  type: 'test'
  ...
# Subtest: F1 social preserves closed state and existing issues
ok 23 - F1 social preserves closed state and existing issues
  ---
  duration_ms: 1.089625
  type: 'test'
  ...
# Subtest: F1 social keeps pending order collection and does not schedule another AI reply
ok 24 - F1 social keeps pending order collection and does not schedule another AI reply
  ---
  duration_ms: 0.47975
  type: 'test'
  ...
# Subtest: F1 greetings from multiple customers create no knowledge gaps
ok 25 - F1 greetings from multiple customers create no knowledge gaps
  ---
  duration_ms: 0.192167
  type: 'test'
  ...
# Subtest: F1 configured handoff still takes precedence over a social phrase
ok 26 - F1 configured handoff still takes precedence over a social phrase
  ---
  duration_ms: 0.075292
  type: 'test'
  ...
1..26
# tests 26
# suites 0
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 67.329292
```

## F8 实现与撤修反证

完成记录或可归属的公开答复满足诉求确认；内部备注不算。已完成问题从遗留项排除，关闭 API 拒绝对已完成问题作不适用/撤回处置；未完成问题默认仍建跟进工单。未修改页面表单，因为完成问题无遗留行时自然不提供处置选项。

### F1 反向验证

命令：`node --test --test-reporter=tap --test-name-pattern="F1 " tests/t151-p0.test.cjs`。仅临时还原该修复的源码片段（由 HEAD 与当前 diff 定位），测试未变；finally 恢复修复内容。

reverse-red 原始输出：

```text
TAP version 13
# Subtest: F1 pure social: 你好
not ok 1 - F1 pure social: 你好
  ---
  duration_ms: 8.378708
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
# Subtest: F1 pure social: 在吗
not ok 2 - F1 pure social: 在吗
  ---
  duration_ms: 0.24825
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
# Subtest: F1 pure social: 谢谢
not ok 3 - F1 pure social: 谢谢
  ---
  duration_ms: 0.197625
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 好的
not ok 4 - F1 pure social: 好的
  ---
  duration_ms: 0.187542
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 您好！
not ok 5 - F1 pure social: 您好！
  ---
  duration_ms: 0.196416
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 谢谢你，辛苦了。
not ok 6 - F1 pure social: 谢谢你，辛苦了。
  ---
  duration_ms: 0.152125
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 嗯嗯，收到
not ok 7 - F1 pure social: 嗯嗯，收到
  ---
  duration_ms: 0.150584
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 明白了
not ok 8 - F1 pure social: 明白了
  ---
  duration_ms: 0.130334
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: OK
not ok 9 - F1 pure social: OK
  ---
  duration_ms: 0.426375
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: hello
not ok 10 - F1 pure social: hello
  ---
  duration_ms: 0.253333
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 您好呀
not ok 11 - F1 pure social: 您好呀
  ---
  duration_ms: 0.176292
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 pure social: 好的，谢谢您
not ok 12 - F1 pure social: 好的，谢谢您
  ---
  duration_ms: 0.150625
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:15:100'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:18:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
ok 13 - F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
  ---
  duration_ms: 0.268875
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
ok 14 - F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
  ---
  duration_ms: 0.143166
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，我要换货 SO20260926001
ok 15 - F1 mixed business preserves routing: 好的，我要换货 SO20260926001
  ---
  duration_ms: 0.337417
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，我要人工
ok 16 - F1 mixed business preserves routing: 你好，我要人工
  ---
  duration_ms: 0.091334
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
ok 17 - F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
  ---
  duration_ms: 0.091291
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
ok 18 - F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
  ---
  duration_ms: 0.097958
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
ok 19 - F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
  ---
  duration_ms: 0.093084
  type: 'test'
  ...
# Subtest: F1 thanks after an answer leaves the result, feedback and issue counts intact
not ok 20 - F1 thanks after an answer leaves the result, feedback and issue counts intact
  ---
  duration_ms: 0.207125
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:32:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:35:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves queued state and existing issues
not ok 21 - F1 social preserves queued state and existing issues
  ---
  duration_ms: 0.308583
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'customer' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'customer'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:43:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves human state and existing issues
not ok 22 - F1 social preserves human state and existing issues
  ---
  duration_ms: 0.250208
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'customer' !== 'bot'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'bot'
  actual: 'customer'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:43:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social preserves closed state and existing issues
not ok 23 - F1 social preserves closed state and existing issues
  ---
  duration_ms: 0.893125
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:37:48'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'queued' !== 'closed'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'closed'
  actual: 'queued'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:42:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 social keeps pending order collection and does not schedule another AI reply
not ok 24 - F1 social keeps pending order collection and does not schedule another AI reply
  ---
  duration_ms: 0.290791
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:46:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + ''
    - 'SO20260926001'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'SO20260926001'
  actual: ''
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:49:56)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 greetings from multiple customers create no knowledge gaps
not ok 25 - F1 greetings from multiple customers create no knowledge gaps
  ---
  duration_ms: 0.278625
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:53:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    3 !== 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 3
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:55:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F1 configured handoff still takes precedence over a social phrase
ok 26 - F1 configured handoff still takes precedence over a social phrase
  ---
  duration_ms: 0.08825
  type: 'test'
  ...
1..26
# tests 26
# suites 0
# pass 8
# fail 18
# cancelled 0
# skipped 0
# todo 0
# duration_ms 68.630542
```

restored-green 原始输出：

```text
TAP version 13
# Subtest: F1 pure social: 你好
ok 1 - F1 pure social: 你好
  ---
  duration_ms: 3.651292
  type: 'test'
  ...
# Subtest: F1 pure social: 在吗
ok 2 - F1 pure social: 在吗
  ---
  duration_ms: 0.196583
  type: 'test'
  ...
# Subtest: F1 pure social: 谢谢
ok 3 - F1 pure social: 谢谢
  ---
  duration_ms: 0.472292
  type: 'test'
  ...
# Subtest: F1 pure social: 好的
ok 4 - F1 pure social: 好的
  ---
  duration_ms: 0.196791
  type: 'test'
  ...
# Subtest: F1 pure social: 您好！
ok 5 - F1 pure social: 您好！
  ---
  duration_ms: 0.161959
  type: 'test'
  ...
# Subtest: F1 pure social: 谢谢你，辛苦了。
ok 6 - F1 pure social: 谢谢你，辛苦了。
  ---
  duration_ms: 0.117667
  type: 'test'
  ...
# Subtest: F1 pure social: 嗯嗯，收到
ok 7 - F1 pure social: 嗯嗯，收到
  ---
  duration_ms: 0.117958
  type: 'test'
  ...
# Subtest: F1 pure social: 明白了
ok 8 - F1 pure social: 明白了
  ---
  duration_ms: 0.111167
  type: 'test'
  ...
# Subtest: F1 pure social: OK
ok 9 - F1 pure social: OK
  ---
  duration_ms: 0.349833
  type: 'test'
  ...
# Subtest: F1 pure social: hello
ok 10 - F1 pure social: hello
  ---
  duration_ms: 0.149208
  type: 'test'
  ...
# Subtest: F1 pure social: 您好呀
ok 11 - F1 pure social: 您好呀
  ---
  duration_ms: 0.120167
  type: 'test'
  ...
# Subtest: F1 pure social: 好的，谢谢您
ok 12 - F1 pure social: 好的，谢谢您
  ---
  duration_ms: 0.10575
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
ok 13 - F1 mixed business preserves routing: 你好，七天无理由退货有什么条件？
  ---
  duration_ms: 0.474625
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
ok 14 - F1 mixed business preserves routing: 谢谢，查物流 SO20260926001
  ---
  duration_ms: 0.124583
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，我要换货 SO20260926001
ok 15 - F1 mixed business preserves routing: 好的，我要换货 SO20260926001
  ---
  duration_ms: 0.28275
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 你好，我要人工
ok 16 - F1 mixed business preserves routing: 你好，我要人工
  ---
  duration_ms: 0.14925
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
ok 17 - F1 mixed business preserves routing: 谢谢，礼品卡可以分多次使用吗？
  ---
  duration_ms: 0.117
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
ok 18 - F1 mixed business preserves routing: 好的，不要转人工，我只问退货规则
  ---
  duration_ms: 0.09375
  type: 'test'
  ...
# Subtest: F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
ok 19 - F1 mixed business preserves routing: 谢谢不用退货了，查物流 SO20260926001
  ---
  duration_ms: 0.083333
  type: 'test'
  ...
# Subtest: F1 thanks after an answer leaves the result, feedback and issue counts intact
ok 20 - F1 thanks after an answer leaves the result, feedback and issue counts intact
  ---
  duration_ms: 0.215125
  type: 'test'
  ...
# Subtest: F1 social preserves queued state and existing issues
ok 21 - F1 social preserves queued state and existing issues
  ---
  duration_ms: 0.179584
  type: 'test'
  ...
# Subtest: F1 social preserves human state and existing issues
ok 22 - F1 social preserves human state and existing issues
  ---
  duration_ms: 0.200375
  type: 'test'
  ...
# Subtest: F1 social preserves closed state and existing issues
ok 23 - F1 social preserves closed state and existing issues
  ---
  duration_ms: 1.158042
  type: 'test'
  ...
# Subtest: F1 social keeps pending order collection and does not schedule another AI reply
ok 24 - F1 social keeps pending order collection and does not schedule another AI reply
  ---
  duration_ms: 0.559125
  type: 'test'
  ...
# Subtest: F1 greetings from multiple customers create no knowledge gaps
ok 25 - F1 greetings from multiple customers create no knowledge gaps
  ---
  duration_ms: 0.195708
  type: 'test'
  ...
# Subtest: F1 configured handoff still takes precedence over a social phrase
ok 26 - F1 configured handoff still takes precedence over a social phrase
  ---
  duration_ms: 0.087791
  type: 'test'
  ...
1..26
# tests 26
# suites 0
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 56.089416
```

### F8 反向验证

命令：`node --test --test-reporter=tap --test-name-pattern="F8 " tests/t151-p0.test.cjs`。仅临时还原该修复的源码片段（由 HEAD 与当前 diff 定位），测试未变；finally 恢复修复内容。

reverse-red 原始输出：

```text
TAP version 13
# Subtest: F8 completed support has no leftover; closing preserves result and done snapshot without tickets
not ok 1 - F8 completed support has no leftover; closing preserves result and done snapshot without tickets
  ---
  duration_ms: 3.325625
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:62:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'todo' !== 'done'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'done'
  actual: 'todo'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:64:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
# Subtest: F8 public reply confirms the sole issue but an internal note does not
not ok 2 - F8 public reply confirms the sole issue but an internal note does not
  ---
  duration_ms: 0.769209
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:70:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'todo' !== 'done'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'done'
  actual: 'todo'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:74:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
# Subtest: F8 refuses forged na for a completed issue atomically
not ok 3 - F8 refuses forged na for a completed issue atomically
  ---
  duration_ms: 0.718375
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:77:40'
  failureType: 'testCodeFailure'
  error: 'Missing expected exception.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  operator: 'throws'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:79:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 refuses forged withdrawn for a completed issue atomically
not ok 4 - F8 refuses forged withdrawn for a completed issue atomically
  ---
  duration_ms: 0.349791
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:77:40'
  failureType: 'testCodeFailure'
  error: 'Missing expected exception.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  operator: 'throws'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:79:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 completed order is excluded while unfinished issues still require tracked dispositions
not ok 5 - F8 completed order is excluded while unfinished issues still require tracked dispositions
  ---
  duration_ms: 4.603209
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:82:1'
  failureType: 'testCodeFailure'
  error: |-
    The expression evaluated to a falsy value:

      assert.ok(p.items.every(i=>i.caseId===openId))

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:84:66)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
# Subtest: F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
not ok 6 - F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
  ---
  duration_ms: 35.69525
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:88:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    1 !== 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 0
  actual: 1
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:91:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
1..6
# tests 6
# suites 0
# pass 0
# fail 6
# cancelled 0
# skipped 0
# todo 0
# duration_ms 90.766834
```

restored-green 原始输出：

```text
TAP version 13
# Subtest: F8 completed support has no leftover; closing preserves result and done snapshot without tickets
ok 1 - F8 completed support has no leftover; closing preserves result and done snapshot without tickets
  ---
  duration_ms: 3.610875
  type: 'test'
  ...
# Subtest: F8 public reply confirms the sole issue but an internal note does not
ok 2 - F8 public reply confirms the sole issue but an internal note does not
  ---
  duration_ms: 0.455292
  type: 'test'
  ...
# Subtest: F8 refuses forged na for a completed issue atomically
ok 3 - F8 refuses forged na for a completed issue atomically
  ---
  duration_ms: 0.332417
  type: 'test'
  ...
# Subtest: F8 refuses forged withdrawn for a completed issue atomically
ok 4 - F8 refuses forged withdrawn for a completed issue atomically
  ---
  duration_ms: 0.214
  type: 'test'
  ...
# Subtest: F8 completed order is excluded while unfinished issues still require tracked dispositions
ok 5 - F8 completed order is excluded while unfinished issues still require tracked dispositions
  ---
  duration_ms: 1.670083
  type: 'test'
  ...
# Subtest: F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
ok 6 - F8 closing UI shows no disposition for completed issues and preserves defaults for open ones
  ---
  duration_ms: 28.795625
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 79.853375
```


## 轻量独立审查与修复

触发：消息路由、回复归属、SOP 与关闭数据完整性相互耦合。两路只读审查（正确性/边界；复杂度/范围/证据），产出 Agent：Codex；未降级。去重后 P0=0、P1=2、P2=1，有效新增3；审查成本相对预期返工收益：低。

- P1 正则回溯：重复语气词加业务内容会阻塞主线程；改为无嵌套重复的词元匹配，长混合句保留订单路由。
- P1 客户拒绝 AI 后仍自动礼貌回复：拒绝状态下仅记录消息，不改变问题/缺口/状态；普通寒暄仍由机器人回应。此为保留现有明确拒绝语义。
- P2 回复归属：发送时保存 caseId 与诉求确认时间，UI 传递选中或引用的问题；验证所属会话和引用一致，防止新增问题使历史确认回退。历史无法可靠归属的裸回复不猜测。
- 页面发现新路由步骤显示英文 social，desk.js 映射为“礼貌回应”；不涉及样式。

以下为新增反例的实际原始输出（首次 UI 夹具 form 名错误已先改为现有 reply，最终红灯均因业务断言）：

### review-red

```text
TAP version 13
# Subtest: F8 public answer confirmation survives a later issue in the same conversation
not ok 1 - F8 public answer confirmation survives a later issue in the same conversation
  ---
  duration_ms: 5.065042
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:77:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    'todo' !== 'done'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'done'
  actual: 'todo'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:80:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
# Subtest: F8 reply is attributed to the selected issue and rejects unrelated issue ids
not ok 2 - F8 reply is attributed to the selected issue and rejects unrelated issue ids
  ---
  duration_ms: 24.43425
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:83:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + undefined
    - 'SC00104'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'SC00104'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:87:61)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
# Subtest: F1 long mixed acknowledgement does not block classification
not ok 3 - F1 long mixed acknowledgement does not block classification
  ---
  duration_ms: 2004.48175
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:92:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + Error: spawnSync /opt/homebrew/Cellar/node/26.7.0/bin/node ETIMEDOUT
    +     at Object.spawnSync (node:internal/child_process:1144:20)
    +     at spawnSync (node:child_process:928:24)
    +     at TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:95:12)
    +     at Test.runInAsyncScope (node:async_hooks:226:14)
    +     at Test.run (node:internal/test_runner/test:1397:25)
    +     at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    +     at Test.postRun (node:internal/test_runner/test:1537:19)
    +     at Test.run (node:internal/test_runner/test:1462:12)
    +     at async Test.processPendingSubtests (node:internal/test_runner/test:969:7) {
    +   code: 'ETIMEDOUT',
    +   errno: -60,
    +   path: '/opt/homebrew/Cellar/node/26.7.0/bin/node',
    +   spawnargs: [
    +     '-e',
    +     "const D=require('./src/domain.js'),S=require('./src/seed.js');process.stdout.write(JSON.stringify(D.classify(S.create(), '哦'.repeat(100)+'x', 'C001').map(r=>r.kind)))"
    +   ],
    +   syscall: 'spawnSync /opt/homebrew/Cellar/node/26.7.0/bin/node'
    + }
    - undefined

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  actual:
  error: 'spawnSync /opt/homebrew/Cellar/node/26.7.0/bin/node ETIMEDOUT'
  stack: |-
    Object.spawnSync (node:internal/child_process:1144:20)
    spawnSync (node:child_process:928:24)
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:95:12)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:96:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.processPendingSubtests (node:internal/test_runner/test:969:18)
    Test.postRun (node:internal/test_runner/test:1537:19)
    Test.run (node:internal/test_runner/test:1462:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:969:7)
  ...
1..3
# tests 3
# suites 0
# pass 0
# fail 3
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2085.356958
```

### optout-red

```text
TAP version 13
# Subtest: F1 explicit AI refusal survives polite messages across conversation states
not ok 1 - F1 explicit AI refusal survives polite messages across conversation states
  ---
  duration_ms: 10.907083
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:61:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    6 !== 5

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 5
  actual: 6
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:68:11)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 69.886833
```

### review-final-green

```text
TAP version 13
# Subtest: F1 explicit AI refusal survives polite messages across conversation states
ok 1 - F1 explicit AI refusal survives polite messages across conversation states
  ---
  duration_ms: 6.86025
  type: 'test'
  ...
# Subtest: F8 public answer confirmation survives a later issue in the same conversation
ok 2 - F8 public answer confirmation survives a later issue in the same conversation
  ---
  duration_ms: 0.533625
  type: 'test'
  ...
# Subtest: F8 reply is attributed to the selected issue and rejects unrelated issue ids
ok 3 - F8 reply is attributed to the selected issue and rejects unrelated issue ids
  ---
  duration_ms: 47.37825
  type: 'test'
  ...
# Subtest: F1 long mixed acknowledgement does not block classification
ok 4 - F1 long mixed acknowledgement does not block classification
  ---
  duration_ms: 54.6605
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 158.160375
```


## 回复归属补充复验

只读复验发现默认显示的问题尚未点击 tab 时未写入 ui 显式选择记录；按实际 active tab 的问题与会话取值，领域层仍校验权限和归属。该项与原 P2 同根，作为同一问题继续收口。

### default-case-red

```text
TAP version 13
# Subtest: F8 reply uses the displayed default issue when no problem tab was clicked
not ok 1 - F8 reply uses the displayed default issue when no problem tab was clicked
  ---
  duration_ms: 26.295583
  type: 'test'
  location: '/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:104:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + undefined
    - 'SC00108'

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'SC00108'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/tests/t151-p0.test.cjs:109:9)
    Test.runInAsyncScope (node:async_hooks:226:14)
    Test.run (node:internal/test_runner/test:1397:25)
    Test.start (node:internal/test_runner/test:1257:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 69.485667
```

### default-case-green

```text
TAP version 13
# Subtest: F8 reply uses the displayed default issue when no problem tab was clicked
ok 1 - F8 reply uses the displayed default issue when no problem tab was clicked
  ---
  duration_ms: 29.236
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 73.661042
```


## 最终验证与交接（2026-10-05）

- 实现主写与最终收敛：Codex；参与：两位 Codex 只读审查 Agent。独立审查已闭环，未解决 P0=0、P1=0、P2=0。范围/证据审查复跑全量 334 通过；正确性审查最终复跑相关 169 通过及三种越权/错配原子拒绝。
- 新增 37 项测试，原有 297 项未改，合计 334；38 个旧 tests/ 文件（含 helper）与开工 HEAD 逐字一致；没有 skip/todo。
- 明卷五目标均符合，17 对照均符合；66 个检查编号齐全，没有符合转不符合。固定复现脚本 SHA256 `261d589425b13b4eabcf2235fe2d2b94fef280922c8eb3dede7809137d414ed7`。
- 额外 S8-6 符合是寒暄路由接管导致“你好”知识正例回归失败的连带结果；未修改发布逻辑。其余 43 项不符合不属于本棒完成范围。
- 复现限制：S4-1、S4-2、S4-8、S5-5、S5-6 依赖“你好”自动排队，现在在接管处报“会话不在可领取队列中”；这五项不作为行为无回归证据，不修改冻结脚本。未实施其余缺陷或电商数据改造。
- 下一步：Claude 按原任务书复跑明卷与保留的抽查，给第 1 棒分棒验收结论。执行者自测和内部审查不替代该验收；第 2 至第 5 棒未开始。

### 最终自动测试

项目目录运行 `node --test --test-reporter=tap tests/*.test.cjs > /tmp/T151-final-all-tests.tap`，退出码 0；`tail -n 9 /tmp/T151-final-all-tests.tap` 原始输出：

```text
1..334
# tests 334
# suites 0
# pass 334
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 359.366666
```

### 最终反向验证

每个模式仅临时还原对应修复，测试保持不变，finally 还原后核对源码逐字一致；没有使用 git reset 或丢弃用户改动。命令为 `node --test --test-reporter=tap --test-name-pattern="F1 " tests/t151-p0.test.cjs` / `--test-name-pattern="F8 "`。

F1 reverse-red，末尾 9 行原始输出：

```text
1..28
# tests 28
# suites 0
# pass 9
# fail 19
# cancelled 0
# skipped 0
# todo 0
# duration_ms 95.427125
```

F1 restored-green，末尾 9 行原始输出：

```text
1..28
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 94.643167
```

F8 reverse-red，末尾 9 行原始输出：

```text
1..9
# tests 9
# suites 0
# pass 0
# fail 9
# cancelled 0
# skipped 0
# todo 0
# duration_ms 116.38525
```

F8 restored-green，末尾 9 行原始输出：

```text
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 95.663167
```

### 最终固定复现原始输出

命令：`node /Users/zhang/Desktop/00_工作台/交接记录/2026-10-03-T146客服Demo产品场景审查-复现脚本.cjs`（必须在项目目录运行，退出码 0）。

```text
项目 HEAD=25c2ff7；脚本 sha256=261d589425b1；domain.js=af99dcb324f6；app.js=fe270a50f8af；workbench-app.js=64171c02f995

== 缺陷检查（修复后应全部“符合”） ==
S1-2b  不符合 另一位客服接待有在途工单的客户
        应然：接待人能看到该客户的在途工单与过往会话
        实际：在途工单 TK00127 可见=false；可见该客户会话数=1
S1-2c  不符合 有在途工单的客户打开手机端
        应然：手机首屏提示待客户补充的申请（桌面端已显示）
        实际：手机首屏含“待客户补充”=false（需点“服务进度”才能看到）
S1-3   不符合 暂停人工接待时客户要人工
        应然：回执说明何时会有人回复
        实际：人工客服当前不在线，问题已保留在待接待列表。你可以继续补充信息，之后在这里查看回复。
S1-5   不符合 在人工处理过、已结束的会话里再问标准问题
        应然：机器人答复，或给出排队回执并更新转人工原因
        实际：状态=queued；最后一条=customer；转人工原因=“没有命中已发布知识”（关闭前为“没有命中已发布知识”）
S2-1   符合   寒暄、致谢、确认词
        应然：机器人回应，不建问题、不记缺口、不转人工
        实际：你好→状态bot/新问题0/新缺口0；在吗→状态bot/新问题0/新缺口0；谢谢→状态bot/新问题0/新缺口0；好的→状态bot/新问题0/新缺口0
S2-1b  符合   机器人答对后客户说“谢谢”
        应然：保持自助状态，不新建问题、不记缺口、不进人工队列
        实际：状态=bot；问题标题=退货规则是什么？；新缺口=0
S2-2   不符合 规则咨询已被识别，检索却落空（“怎么退货”）
        应然：已判为规则咨询的问题由机器人用退货政策答复
        实际：识别为规则咨询=true；会话状态=queued；最后一条=system
S2-4   不符合 方案 §4.3 的示例句
        应然：进入退换货受理（含或不含订单号）
        实际：这个杯子漏水，我想换一个→状态queued/问题类型support；这个杯子漏水，我想换一个 SO20260926001→状态queued/问题类型support
S2-8   不符合 订单号输错后，补发正确单号
        应然：提示客户核对后，补发的正确单号能被查询
        实际：机器人先说“暂时无法核对此订单。请确认订单号及…”；随后状态=queued；补发单号后最后一条=customer
S2-7   不符合 待发货订单申请退货
        应然：按订单状态分流（待发货引导取消或拦截），不直接进入退货登记
        实际：订单状态=待发货；直接进入退货登记=true
S3-1   不符合 主动要人工
        应然：回执给出排位或预计等待
        实际：已转入人工接待队列。你提供的信息会一并交给客服，不需要重新描述；等待时也可以继续补充。
S3-4   不符合 多人排队（含关闭后重新排队的会话）
        应然：待接待列表按等待时长从长到短
        实际：显示顺序：C003(已等20分) → C002(已等40分) → C001(已等0分)
S3-5   不符合 全部客服暂离时要人工
        应然：回执如实说明当前无人可接
        实际：全员暂离时回执：已转入人工接待队列。你提供的信息会一并交给客服，不需要重新描述；等待时也可以继续补充。
S3-6   不符合 排队中客户点“新咨询”，客服随后接起旧会话并回复
        应然：客服回复出现在客户正在看的会话里，或旧会话随新咨询转移
        实际：旧会话状态=human；客户页默认显示=新会话；客户能看到客服回复=false
S4-1   不符合 客服查看第二个问题（售后）的上下文
        应然：“最初问题”取该问题自己的第一条客户消息
        实际：检查执行失败：会话不在可领取队列中
S4-2   不符合 动态建议与所选问题对应
        应然：选中“查询订单与物流”时，不给保温杯清洗知识
        实际：检查执行失败：会话不在可领取队列中
S4-8   不符合 人工阶段客户提出新问题
        应然：新问题单独建档，不并入“你好”
        实际：检查执行失败：会话不在可领取队列中
S4-4   不符合 客服已回复，客户静默 2 小时
        应然：会话出现“待结束”提示（结束节点点亮）或释放接待名额
        实际：结束节点=idle；领取第 4 段=已达到个人接待容量
S4-5   不符合 客服把进行中的会话转给同事
        应然：客服侧有转接入口
        实际：客服会话区含转接入口=false
S4-9   不符合 客户在自助阶段说“不要机器人回复”，之后转人工
        应然：记录客户拒绝；接管后不能开启 AI 续答（SOP 方案 §4.1）
        实际：记录拒绝=false；客服开启续答=成功
S4-10  不符合 售后问题下开启 AI 续答，客户先问退货规则、再说“好的”
        应然：有依据的知识问题给知识答复；同一句采集话术不重复发送（SOP 方案 §4.1）
        实际：问退货规则时 AI=“请补充退换货原因及具体要求，客服核对申请后会继续受理。”；说“好的”后 AI=“undefined”
S4-11  不符合 插入建议后知识改版，客服核对后发送
        应然：发出的正文与引用的知识版本一致
        实际：正文=“建议使用软布和中性清洁剂清洗。首…”；引用=v2“新版答复：请用温水和中性…”
S5-1   符合   演示脚本第 3 节：联系人工→接管→记录结果→结束沟通
        应然：已有处理结果的问题不再产生遗留项
        实际：问题=人工协助；遗留项=无
S5-1c  符合   对已完成的问题选“不适用”关闭
        应然：不把已完成问题标为撤回，不改写“记录处理结果”
        实际：问题状态=completed；标记撤回=false；关闭快照“记录处理结果”=done
S5-3   不符合 客户补充资料后
        应然：工单负责人得到可感知的提醒（未读标记、通知或会话消息）
        实际：负责人工单列表该行：保温杯包装破损核实TK00127 · 客户 001处理中客服 0110/05 20:3810/06 20:38未安排查看处理安排回访
S5-4   不符合 客户在手机端从订单卡点“申请退换货”
        应然：不以客户名义发送客户没打的字；入口含糊时服务类型留空
        实际：新增客户消息=1（“申请退货 SO20260926002”）；预填类型=return；预填原因=“申请退货 SO20260926002”
S5-4b  不符合 客户打开售后申请表
        应然：表单使用客户语言：无内部问题编号、无“申请标题”“工单”
        实际：表单出现：内部问题编号、申请标题、工单、待核对
S5-5   不符合 客服按默认处置关闭后，客户查看“服务进度”
        应然：不出现内部跟进单或内部措辞
        实际：检查执行失败：会话不在可领取队列中
S5-6   不符合 客户“服务进度”的计数
        应然：标题计数与列出的卡片数一致
        实际：检查执行失败：会话不在可领取队列中
S5-4c  不符合 客服在“确认诉求”里把问题标题改成内部备注后，客户打开售后申请表
        应然：客户看不到客服写的内部标题
        实际：客户表单出现客服写的内部标题=true
S5-7   不符合 客服“请客户补充”后，客户直接在聊天里回复
        应然：客户在默认会话里能看到补充请求；聊天回复能进入原工单
        实际：默认会话里有补充请求=false；回复后工单历史 3→3、状态=waiting_customer；会话=queued，新问题“杯身没有破损，可以正常使用”
S5-8   不符合 客户自建售后工单尚未被领取，客服接待后结束沟通
        应然：关闭面板给出可用的去向（例如领取并跟进）
        实际：existing=请关联同一问题且已分配负责人的办理中工单；new=请先领取本人有权处理的任务；callback=请先领取本人有权处理的任务
S5-9   不符合 售后已办结（待客户反馈），客户在新会话再次申请同一订单
        应然：机器人给出的下一步能走通
        实际：机器人：“此问题已受理，工单 TK00127。可以继续在原记录查看进度或补充信息，无需重复提交。”；按提示补充=已有处理结果；如有异议，请使用“仍需帮助”
S5-10  不符合 排队中的客户在桌面客户页点“联系人工”
        应然：与手机端一致：按钮不可点或显示当前状态
        实际：桌面按钮禁用=false（“联系人工”）；手机按钮禁用=true（“人工排队中”）
S6-6   不符合 自助会话客户离开 24 小时
        应然：会话被系统视为结束（状态或标记），可计入自助会话统计
        实际：24 小时后（期间系统有其他操作）状态=bot
S6-7   不符合 客服都满载或暂离时，排队客户已经离开
        应然：排队会话能被清理（结束、超时或无需接管即可关闭）
        实际：客服直接结束=请先领取本人有权处理的任务；客服领取=已达到个人接待容量；经理改派=目标客服不可接待或已满载
S6-8   不符合 自助会话一直不结束，期间运营发布了新策略
        应然：客户之后在原会话里的咨询使用新策略
        实际：已发布 v2（售后交人工）；一天前打开的会话仍用 v1，结果=仍弹出自助申请
S7-4   不符合 一段会话里两个问题都已答复
        应然：每张“解决了吗”卡片标明对应哪个问题
        实际：卡片文字：这个问题解决了吗？已解决仍需帮助｜这个问题解决了吗？已解决仍需帮助
S7-4b  不符合 两张“解决了吗”卡片的顺序
        应然：卡片顺序与提问顺序一致
        实际：提问顺序=七天无理由退货有什么条件？ → 保温杯怎么清洗？；卡片顺序=保温杯怎么清洗？ → 七天无理由退货有什么条件？
S8-1a  符合   多位客户都说“你好”
        应然：寒暄不形成知识缺口
        实际：“你好”缺口条数=0
S8-1b  不符合 同一个未知问题被 3 位客户各问一次
        应然：缺口按问法跨会话合并（一条记录，带次数）
        实际：“可以开发票吗”缺口条数=3
S8-4   不符合 经理打开服务概览
        应然：能看到转人工率（或转人工数与原因）和首响超时的排队会话
        实际：概览含“转人工”=false；含“首响”=false（客户 003 已等待超过首响目标）
S8-5   不符合 客户问“人工服务时间是几点”
        应然：命中服务时间知识，同时“我要人工”仍转人工
        实际：“人工服务时间是几点”→handoff；“我要人工”→handoff
S8-6   符合   运营新增一条标准问题很短的知识（“你好”）并发布
        应然：回归能拦住，或真实问题不被它吞掉
        实际：回归通过=false；“你好，礼品卡可以分多次使用吗？”→gap
S8-7   不符合 停用退货政策知识后运行产品回归
        应然：回归如实反映真实会话的路由
        实际：回归“拒绝转人工不应升级”=通过；真实会话同一句→queued
S8-8   不符合 工单在“待客户补充”期间超过处理目标
        应然：不计入逾期（处理时限在等待客户时暂停）
        实际：工单状态=waiting_customer；概览逾期数=1
S9-1b  不符合 经理在“团队协同”查看排队会话
        应然：列表显示每段会话的等待时长或首响超时
        实际：列表行：客户 003CV00111 · 没有命中已发布知识待人工接待分配客服
S9-4   不符合 经理暂停人工接待时已有客户在排队
        应然：已排队客户收到通知
        实际：已排队会话 CV00111 新增消息=0
S9-5   不符合 管理员查看操作审计
        应然：动作以可读文字显示
        实际：出现命令名：newConversation、updateTicket、claimTicket、createTicket、closeConversation

== 对照检查（现有长处，应保持“符合”） ==
S1-2a  符合   有在途工单的客户打开桌面客户页
        应然：首屏“服务进度”显示待客户补充的申请
        实际：首屏含“待客户补充”=true
S1-5b  符合   纯自助会话结束后再问标准问题
        应然：机器人照常答复
        实际：状态=bot；最后一条=bot
S2-2+  符合   规则咨询的标准与近似说法
        应然：按规则正确处理
        实际：七天无理由退货有什么条件？→answer(KB001)；退货要什么条件→answer(KB001)
S2-3+  符合   查单的明确说法
        应然：按规则正确处理
        实际：我的快递到哪了→askOrder；查物流 SO20260926001→order
S2-4+  符合   售后的明确说法
        应然：按规则正确处理
        实际：我要换货 SO20260926001→intake；申请退货 SO20260926001→intake
S2-5   符合   一句话两个诉求
        应然：按规则正确处理
        实际：查物流 SO20260926001，再申请退货→order+intake
S2-6   符合   否定表述
        应然：不误转人工（走完整会话）
        实际：不要转人工，我只问退货规则→状态bot；我不要退货了，查下物流 SO20260926001→状态bot
S2-9   符合   真实的未知问题
        应然：记缺口并转人工（走完整会话）
        实际：状态=queued；新缺口=1
S3-3   符合   排队中取消
        应然：回到自助，记录保留
        实际：状态=bot
S4-5b  符合   经理在“团队协同”分配排队或接待中的会话
        应然：有列表和“分配客服”按钮，分配后由新客服接待
        实际：分配按钮数=2；分配后负责人=zhou
S5-2   符合   客服代客结构化登记售后，重复确认
        应然：只生成一张工单
        实际：第一次=TK00147；重复=TK00147（created=false）
S6-3   符合   客户断线（模拟离线）
        应然：暂停 AI，结束节点点亮
        实际：结束节点=todo；AI 续答=false
S6-5   符合   带未完成售后结束沟通
        应然：生成有负责人、目标时间的纯跟进单，不冒充已登记
        实际：TK00147 负责人=lin；纯跟进=true
S7-1   符合   客户对办理结果提出异议
        应然：原工单重开，保留首次受理时间
        实际：状态=working；受理时间保留=true
S7-2   符合   回访未接通且不改约
        应然：必须改约到未来时间
        实际：被拒绝：未联系到客户时须设置下次回访时间
S8-2   符合   缺口→复核→修订→发布→原问题验收
        应然：闭环走通且原问题命中
        实际：回归通过=true；验收=通过；现在=answer(KB002)
S9-3   符合   经理修改接待规则
        应然：容量、首响、工单时限、接待开关可配置
        实际：{"capacity":4,"responseMinutes":10,"ticketHours":48,"accepting":true}

== 样本（只打印，不计数）==
[自然语言边界（已声明边界，不计数）] N1 常见口语说法
        保温杯怎么洗→gap；快递怎么还没到→gap；发货了吗→gap；我想换个颜色 SO20260926001→gap
[需用户裁决的设计取舍（不计数）] D1 排队期间问机器人能答的问题（§4.1 只允许一次承接说明）
        排队中提问后最后一条=customer（界面有“已在排队，补充信息会一并交给客服”提示与“取消排队”按钮）
[已核对、不计为缺陷] S4-6 客服设为暂离时手上的会话不自动释放（常见做法，经理可在“团队协同”改派）
        暂离后会话仍由客服 01 接待=true
[需用户裁决的设计取舍（不计数）] D6 忙时 AI 续答的开启方式与参数（§4.1、§8：默认关闭、逐会话授权、30 秒、2 轮）
        参数写在 domain.js（等待 30000 毫秒、remaining=2），运营不可配置
[需用户裁决的设计取舍（不计数）] D5 接待策略的可配置范围（方案限定为触发词与售后开关）
        策略字段：humanWords、intakeEnabled
[需用户裁决的设计取舍（不计数）] D2 未命中知识的处理（方案：未命中即转人工）
        “礼品卡可以分多次使用吗？”→gap（无澄清环节）
[需用户裁决的设计取舍（不计数）] D4 订单号核对失败（验收矩阵 V04：转人工核实）
        不存在的订单号→状态=queued；回复=暂时无法核对此订单。请确认订单号及购买账户；我不会展示其他账户的订单信息。

缺陷检查 49 项：不符合 43，符合 6；对照检查 17 项：符合 17，不符合 0；样本 7 条
```

### 真实页面与数据隔离

命令：在 `/tmp/T151-browser-se0wmf9j` 运行 `python3 run.py --port 8769 --no-open`。沙箱首轮拒绝监听，获本机验证执行权限后启动成功；服务只监听 `127.0.0.1`。临时副本的 `src/store.js` 与单文件只将保存键替换为 `qinghe-support-t151-verification`，其余源码/样式逐字相同；未访问或写入 8768、`qinghe-support-v4`，项目存储模块未改。

```text
智能客服：http://127.0.0.1:8769/
按 Ctrl+C 停止。只允许本机访问。
```

已实际在最终源码入口和重建的 `dist/智能客服.html` 上用 UI 操作：新咨询 → 你好 → 谢谢 → 联系人工 → 接管 → 记录当场结果 → 保存关闭 → 查看关闭记录。源码入口额外经过知识答复、默认选中的人工问题直接公开回复。只用虚构样例。

浏览器读取原文：

```text
智能接待
您好，我在。请告诉我需要什么帮助。
不客气，有其他问题可以继续告诉我。
确认诉求
已完成
SOP 看板
0 个待处理
当前没有必须安排的未完成事项。
沟通已结束，后续安排已保存
当时的节点与后续安排
无未完成事项
{ sourceErrors: [], singleErrors: [] }
```

截图：`/tmp/T151-final-close-preview.png`、`/tmp/T151-final-close-history.png`、`/tmp/T151-single-close-history.png`。任务创建的两个标签页已关闭，8769 进程已 Ctrl+C 正常退出（输出“已停止。”）。截图和临时副本仅作本机会话证据，正式复验可重跑命令及 UI。

### 文件范围

项目仓库：`src/domain.js`、`src/workbench-app.js`、`src/views/desk.js`、`tests/t151-p0.test.cjs`、`dist/智能客服.html`、`MANIFEST.sha256`、`PROGRESS.md`、`BLOCKED.md`。
桌面仓库：本项目 `工作记录.md` 追加一节、`00_工作台/当前工作.md` 仅 T-151 行与详情。

现役代码只改 3 个 JS 文件，没有新依赖、样式、电商结构或服务端变更。未推送。项目提交通过 `git log -1 --oneline` 核对，提交号另记工作记录及 T-151。

### 构建与 MANIFEST

命令：`python3 build_single.py`，退出码 0：

```text
/Users/zhang/Desktop/求职与学习/求职作品集/简历项目/通用智能客服平台/dist/智能客服.html
```

MANIFEST 按原规则覆盖项目所有纳管文件（除 MANIFEST 自身），原76项加新增测试、PROGRESS、BLOCKED共79项。命令 `shasum -a 256 -c MANIFEST.sha256`，退出码0：

```text
.gitignore: OK
BLOCKED.md: OK
PRODUCT_EXPERIENCE.json: OK
PROGRESS.md: OK
README.md: OK
app.js: OK
build_single.py: OK
dist/智能客服.html: OK
docs/交付与应用说明.md: OK
docs/产品体验调整.md: OK
docs/当前方案与角色分工修改计划.md: OK
docs/演示脚本.md: OK
docs/评审与修改记录.md: OK
docs/验收矩阵.md: OK
engine.js: OK
flow-editor.js: OK
flow-graph.js: OK
index.html: OK
legacy.html: OK
product-copy.js: OK
product.css: OK
run.py: OK
src/app.js: OK
src/copy.js: OK
src/domain.js: OK
src/forms.css: OK
src/mobile.css: OK
src/seed.js: OK
src/store.js: OK
src/styles.css: OK
src/theme.css: OK
src/views/customer.js: OK
src/views/desk.js: OK
src/views/mobile.js: OK
src/views/operations.js: OK
src/views/shared.js: OK
src/workbench-app.js: OK
src/workbench.css: OK
styles.css: OK
tests/browser_smoke.py: OK
tests/copy.test.cjs: OK
tests/domain.test.cjs: OK
tests/engine.test.cjs: OK
tests/evidence/README.md: OK
tests/evidence/baseline-engine-tests.cjs.txt: OK
tests/evidence/baseline-findings.json: OK
tests/evidence/baseline-tests.tap: OK
tests/evidence/browser-report.json: OK
tests/evidence/browser-run.txt: OK
tests/evidence/copy-all-tests.tap: OK
tests/evidence/copy-local-review.json: OK
tests/evidence/copy-v4-tests.tap: OK
tests/evidence/environment.json: OK
tests/evidence/local-review.json: OK
tests/evidence/local-tests.tap: OK
tests/evidence/pass1-tests.tap: OK
tests/evidence/product-review.json: OK
tests/evidence/product-tests.tap: OK
tests/evidence/sop-all-tests.tap: OK
tests/evidence/sop-mobile-review.json: OK
tests/evidence/sop-v4-tests.tap: OK
tests/evidence/static-resource-check.json: OK
tests/evidence/unit-tests.tap: OK
tests/evidence/v4-all-tests.tap: OK
tests/evidence/v4-local-review.json: OK
tests/evidence/v4-tests.tap: OK
tests/fixtures/previous-defaults.json: OK
tests/graph.test.cjs: OK
tests/helpers/app.cjs: OK
tests/product-experience.test.cjs: OK
tests/product_browser_smoke.py: OK
tests/requirements.txt: OK
tests/t151-p0.test.cjs: OK
tests/ui.test.cjs: OK
tests/v4-ui.test.cjs: OK
tests/workbench-review.test.cjs: OK
tests/workbench-ui.test.cjs: OK
tests/workflow.test.cjs: OK
方案文档.md: OK
```

将本段验证输出写入后，重新计算 PROGRESS 对应哈希并再次执行同一校验；最终结果见命令输出。
