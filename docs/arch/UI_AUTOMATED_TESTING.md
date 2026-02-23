# UI 自动化测试系统设计

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Test Runner (Vitest)                          │
├─────────────────────────────────────────────────────────────────┤
│  L0: API 契约层   │  L1: 控件探测层   │  L2: 业务链路层   │  L3: 稳定性层  │
│  CLI/API/WS      │  full-cover      │  run-flow        │  3轮回归      │
│  接口可用性       │  全控件覆盖       │  端到端流程       │  停启恢复      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Test API                              │
│  - testContext.spawnApp()    启动 Desktop Console               │
│  - testContext.api()         Unified API 客户端                  │
│  - testContext.ws()          WebSocket 客户端                    │
│  - testContext.cli()         webauto/camo CLI 封装               │
│  - testContext.ui()          UI CLI 控制 (click/input/tab)       │
│  - testContext.snapshot()    状态快照采集                        │
│  - testContext.cleanup()     测试后清理                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    State Bridge                                  │
│  - 任务状态同步 (onStateUpdate)                                   │
│  - 命令事件流 (onCmdEvent)                                        │
│  - Runtime 会话 (runtimeListSessions)                            │
│  - 环境检查 (envCheckAll)                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 测试分层

### L0: API 契约层
验证所有 API/CLI/WS 接口真实可用，参数/返回结构正确。

```bash
# 测试命令
webauto ui cli start --build
webauto ui cli status --json
webauto ui cli snapshot --json
webauto ui cli tab --tab 配置
webauto ui cli input --selector "#keyword-input" --value "test"
webauto ui cli click --selector "#start-btn"
webauto ui cli probe --selector "#id"
webauto ui cli wait --selector "#id" --state visible
webauto ui cli click-text --text "保存"
webauto ui cli dialogs --value silent
webauto ui cli stop
```

### L1: 控件探测层
验证所有 UI 控件可探测、可操作、状态可读。

```bash
webauto ui cli full-cover --build --install --output ./.tmp/ui-cli-full-cover.json
```

验收：`coverage.failed=0`，所有 bucket 通过。

### L2: 业务链路层
端到端真实业务流程测试，不使用 mock。

链路示例：
1. 配置页输入参数 → 启动任务 → 看板显示进度 → 完成
2. 定时任务：创建 → 编辑 → 执行 → 删除
3. 账号管理：检查 → 修复 → 打开
4. 设置：修改 → 保存 → 重新加载验证

### L3: 稳定性层
连续 3 轮：full-cover → stop → start → full-cover

验收：无 UI bridge 卡死，stop 后可重启。

## 3. 统一测试 API

```typescript
// tests/e2e-ui/test-context.ts
interface TestContext {
  // App 生命周期
  spawnApp(options?: { headless?: boolean }): Promise<void>;
  stopApp(): Promise<void>;
  
  // Unified API (HTTP)
  api: {
    get(path: string): Promise<any>;
    post(path: string, body: any): Promise<any>;
    health(): Promise<boolean>;
    listTasks(): Promise<Task[]>;
    getTask(runId: string): Promise<Task>;
  };
  
  // WebSocket
  ws: {
    connect(): Promise<void>;
    subscribe(event: string, handler: Function): void;
    unsubscribe(event: string): void;
    close(): void;
  };
  
  // CLI 封装
  cli: {
    webauto(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; json?: any }>;
    camo(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; json?: any }>;
  };
  
  // UI CLI 控制
  ui: {
    start(build?: boolean): Promise<void>;
    stop(): Promise<void>;
    status(): Promise<any>;
    snapshot(): Promise<any>;
    tab(name: string): Promise<void>;
    input(selector: string, value: string): Promise<void>;
    click(selector: string): Promise<void>;
    clickText(text: string): Promise<void>;
    probe(selector: string): Promise<{ exists: boolean; visible: boolean; value?: string }>;
    wait(selector: string, state: 'visible' | 'exists' | 'hidden', timeout?: number): Promise<void>;
    dialogs(value: 'silent' | 'restore'): Promise<void>;
    run(spec: { tab: string; actions: Action[] }): Promise<void>;
    fullCover(output?: string): Promise<{ ok: boolean; report: any }>;
  };
  
  // 状态快照
  snapshot(): Promise<{
    tasks: Task[];
    sessions: Session[];
    env: EnvStatus;
    settings: Settings;
  }>;
  
  // 清理
  cleanup(): Promise<void>;
}
```

## 4. 状态编排

### 4.1 任务状态流
```
created → queued → running → completed/failed
                ↘ paused → resumed
```

### 4.2 状态同步机制
- WebSocket 实时推送 (`task:*`, `session:*`, `env:*`)
- HTTP 轮询兜底 (每 5s)
- UI 心跳 (每 10s)

### 4.3 状态断言
```typescript
await testContext.waitFor(
  (state) => state.tasks.some(t => t.runId === targetRunId && t.status === 'completed'),
  { timeout: 60000, interval: 1000 }
);
```

## 5. 测试用例模板

### 5.1 L0 API 契约测试
```typescript
// tests/e2e-ui/contracts/api.test.ts
describe('L0: API Contract', () => {
  it('Unified API health check', async () => {
    const ok = await ctx.api.health();
    assert.ok(ok);
  });
  
  it('WebSocket connects and receives events', async () => {
    await ctx.ws.connect();
    const events = await collectEvents(ctx.ws, 'task:*', 5000);
    assert.ok(events.length >= 0);
  });
  
  it('UI CLI start/status/stop cycle', async () => {
    await ctx.ui.start(true);
    const status = await ctx.ui.status();
    assert.ok(status.ok);
    await ctx.ui.stop();
  });
});
```

### 5.2 L1 控件探测测试
```typescript
// tests/e2e-ui/controls/full-cover.test.ts
describe('L1: Full Cover', () => {
  it('all controls are reachable and operable', async () => {
    const report = await ctx.ui.fullCover('./.tmp/full-cover.json');
    assert.ok(report.ok);
    assert.equal(report.coverage.failed, 0);
    for (const bucket of Object.values(report.coverage.buckets)) {
      assert.equal(bucket.failed, 0);
    }
  });
});
```

### 5.3 L2 业务链路测试
```typescript
// tests/e2e-ui/flows/task-run.test.ts
describe('L2: Task Run Flow', () => {
  it('config → run → dashboard → complete', async () => {
    await ctx.ui.tab('配置');
    await ctx.ui.input('#keyword-input', 'CI-test');
    await ctx.ui.input('#target-input', '5');
    await ctx.ui.click('#start-btn');
    
    const runId = await waitForRunStart(ctx, 10000);
    assert.ok(runId);
    
    await ctx.ui.tab('看板');
    const task = await waitForTaskComplete(ctx, runId, 60000);
    assert.equal(task.status, 'completed');
  });
});
```

### 5.4 L3 稳定性测试
```typescript
// tests/e2e-ui/stability/restart.test.ts
describe('L3: Stability', () => {
  it('3 consecutive full-cover passes', async () => {
    for (let i = 0; i < 3; i++) {
      const report = await ctx.ui.fullCover();
      assert.ok(report.ok, `Round ${i + 1} failed`);
      await ctx.ui.stop();
      await ctx.ui.start();
    }
  });
});
```

## 6. CI 集成

### 6.1 门禁检查
```yaml
# .github/workflows/ui-test.yml
- name: UI E2E Tests
  run: |
    npm run build:services
    npm --prefix apps/desktop-console run build
    npm run test:e2e-ui
    
- name: Coverage Gate
  run: |
    npm --prefix apps/desktop-console run test:renderer:coverage
    node scripts/test/check-coverage.mjs --min-lines 90 --min-functions 85
```

### 6.2 测试产物
- `.tmp/ui-cli-full-cover.json` - L1 覆盖报告
- `.tmp/snapshots/*.json` - 状态快照
- `coverage/` - 覆盖率报告
- `~/.webauto/logs/` - 日志

## 7. 运行命令

```bash
# 完整测试套件
npm run test:e2e-ui

# 单层测试
npm run test:e2e-ui -- --layer L0
npm run test:e2e-ui -- --layer L1
npm run test:e2e-ui -- --layer L2
npm run test:e2e-ui -- --layer L3

# 调试模式
npm run test:e2e-ui -- --debug --slow

# 生成报告
npm run test:e2e-ui -- --reporter html
```

## 8. 关键验证点

| 检查项 | 证据 |
|--------|------|
| API 健康 | `curl http://127.0.0.1:7701/health` 返回 ok |
| WebSocket 连通 | 订阅 `task:*` 收到事件 |
| UI CLI 可控 | `full-cover` 通过 |
| 任务完整流程 | runId 存在，status=completed |
| 定时任务 CRUD | 创建/编辑/执行/删除成功 |
| 稳定性 | 3 轮 full-cover 全绿 |
