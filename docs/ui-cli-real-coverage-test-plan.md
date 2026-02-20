# UI CLI 全面真实覆盖测试方案

## 1. 目标

本方案用于验证 `webauto ui cli` 在真实 UI 环境下的完整可用性、稳定性与业务链路一致性。

测试原则：

- 全程真实执行，不使用 mock UI。
- 以 CLI 可观测证据为准（JSON 报告、状态快照、命令输出）。
- 覆盖命令契约、页面控件、业务流程、稳定性四层。

## 2. 覆盖范围

### L0 命令契约层

覆盖以下动作的真实可执行性：

- `start`
- `status`
- `snapshot`
- `tab`
- `click`
- `focus`
- `input`
- `select`
- `press`
- `probe`
- `click-text`
- `dialogs`
- `wait`
- `run`
- `full-cover`
- `stop`

### L1 UI 控件层

覆盖页面桶（bucket）和关键控件：

- `setup`
- `tasks`
- `dashboard`
- `scheduler`
- `account`
- `logs`
- `settings`

以 `full-cover` 报告中的 `coverage.buckets` 为准。

### L2 业务链路层

覆盖关键链路：

- 任务页配置并执行
- 看板页运行态与状态回流
- 定时任务 CRUD + daemon start/stop
- 账号页检查动作
- 日志页基础操作
- 设置页保存动作

### L3 稳定性层

覆盖重复执行与恢复：

- 连续 3 轮执行 `full-cover`
- stop 后重启再执行
- 状态与快照一致性检查

## 3. 前置条件

1. 安装依赖并可构建：

```bash
npm ci
npm --prefix apps/desktop-console run build
```

2. 本机可启动 UI：

```bash
webauto ui console --check
```

3. 推荐准备至少一个可用账号 profile（业务链路更稳定）。

## 4. 执行步骤

### Step A: 启动与基础健康检查

```bash
webauto ui cli start --build --install --json
webauto ui cli status --json
webauto ui cli snapshot --json
```

验收：

- `status.ok=true`
- `snapshot` 返回当前 tab 与关键状态字段

### Step B: L0 命令契约抽检

```bash
webauto ui cli tab --tab 任务 --json
webauto ui cli probe --selector "#task-keyword" --detailed --json
webauto ui cli input --selector "#task-keyword" --value "ui-cli-smoke" --json
webauto ui cli wait --selector "#task-keyword" --state value_equals --value "ui-cli-smoke" --timeout 8000 --json
webauto ui cli click --selector "#task-run-btn" --json
```

验收：

- 每条命令返回 `ok=true`
- 失败时返回结构化错误（含 action/selector/details）

### Step C: L1+L2 全覆盖执行

```bash
webauto ui cli full-cover --build --output ./.tmp/ui-cli-full-cover.json --json
```

验收：

- `report.ok=true`
- `report.coverage.failed=0`
- 每个 bucket 的 `failed=0`
- 报告文件存在且可解析

### Step D: L3 稳定性执行（3轮）

```bash
webauto ui cli full-cover --output ./.tmp/ui-cli-full-cover-round1.json --json
webauto ui cli full-cover --output ./.tmp/ui-cli-full-cover-round2.json --json
webauto ui cli full-cover --output ./.tmp/ui-cli-full-cover-round3.json --json
```

每轮后补充：

```bash
webauto ui cli status --json
webauto ui cli snapshot --json
```

验收：

- 三轮 `ok=true`
- 无 bridge 不可达、无卡死
- `status/snapshot` 与运行阶段一致

## 5. CI 建议

建议在 CI 增加两档：

1. `ui-cli-contract`：仅 L0 + 快速状态检查（快）
2. `ui-cli-full`：执行 `full-cover` + 产物上传（慢）

最小 CI 命令：

```bash
npm --prefix apps/desktop-console run test:renderer:coverage
webauto ui cli full-cover --build --output ./.tmp/ui-cli-full-cover-ci.json --json
```

## 6. 失败分级与处理

### P0

- `start/status/snapshot` 失败
- `full-cover` `report.ok=false`
- 任一 bucket `failed>0`

处理：阻断发布，必须修复。

### P1

- 单个可选动作失败（optional probe/click）
- 稳定性轮次偶发失败

处理：记录 issue，限制发布范围。

## 7. 证据归档模板

每次执行保留以下证据：

1. 执行命令列表（原文）
2. `status` JSON（开始前/结束后）
3. `snapshot` JSON（开始前/结束后）
4. `full-cover` 报告：
   - `./.tmp/ui-cli-full-cover*.json`
5. 若失败：
   - 失败步骤序号
   - action + selector
   - error/details

## 8. 推荐一键执行脚本（本地）

```bash
set -e
webauto ui cli start --build --install --json
webauto ui cli status --json > ./.tmp/ui-cli-status-before.json
webauto ui cli snapshot --json > ./.tmp/ui-cli-snapshot-before.json
webauto ui cli full-cover --output ./.tmp/ui-cli-full-cover.json --json > ./.tmp/ui-cli-full-cover.stdout.json
webauto ui cli status --json > ./.tmp/ui-cli-status-after.json
webauto ui cli snapshot --json > ./.tmp/ui-cli-snapshot-after.json
```

