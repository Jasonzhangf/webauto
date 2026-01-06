# WebAuto 远程会话架构设计

## 背景与目标

### 架构演进

**原架构（直接调用）：**
```
Unified API (7701)
  └─→ SessionManager (本地)
       └─→ BrowserSession
            └─→ Playwright Page (直接访问)
```

**问题：**
- Unified API 和 Browser Service 耦合在同一进程
- OperationExecutor 需要直接访问 Playwright Page 对象
- 无法实现服务分离和独立扩展

**新架构（远程代理）：**
```
Unified API (7701)                  Browser Service (7704)
  └─→ RemoteSessionManager            └─→ SessionManager (本地)
       └─→ RemoteBrowserSession             └─→ BrowserSession
            └─→ HTTP Request ───────────────────→ Playwright Page
```

**优势：**
- 服务分离：Unified API 和 Browser Service 独立进程
- 协议标准化：通过 HTTP/WebSocket 通信
- 可扩展：可运行多个 Browser Service 实例
- 可测试：每个服务可独立测试

## 核心组件

### 1. RemoteBrowserSession

**位置：** `services/unified-api/RemoteBrowserSession.ts`

**职责：**
- 模拟 BrowserSession 接口
- 将所有操作转换为 HTTP 请求发送到 Browser Service
- 维护会话状态（sessionId, lastKnownUrl）

**接口兼容性：**
```typescript
interface BrowserSession {
  // 属性
  id: string;
  currentPage: Page;
  modeName: 'dev' | 'run';

  // 方法
  ensurePage(url?: string): Promise<Page>;
  goto(url: string): Promise<void>;
  evaluate(expression: string, arg?: any): Promise<any>;
  screenshot(fullPage?: boolean): Promise<Buffer>;
  click(selector: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  getCookies(): Promise<any[]>;
  saveCookiesToFile(path: string): Promise<{ path: string; count: number }>;
  injectCookiesFromFile(path: string): Promise<{ count: number }>;
  close(): Promise<void>;
}
```

**实现示例：**
```typescript
export class RemoteBrowserSession {
  private sessionId: string;
  private baseUrl: string; // http://127.0.0.1:7704

  async goto(url: string): Promise<void> {
    await this.sendCommand('goto', { url });
    this.lastKnownUrl = url;
  }

  async evaluate(expression: string, arg?: any): Promise<any> {
    const script = typeof expression === 'function'
      ? `(${expression.toString()})(${JSON.stringify(arg)})`
      : expression;
    return this.sendCommand('evaluate', { script });
  }

  private async sendCommand(action: string, args?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        args: { profileId: this.sessionId, ...args }
      })
    });

    if (!response.ok) {
      throw new Error(`Browser Service command failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    return result.data || result;
  }
}
```

### 2. RemoteSessionManager

**位置：** `services/unified-api/RemoteSessionManager.ts`

**职责：**
- 管理远程会话的生命周期
- 通过 HTTP 调用 Browser Service 创建/销毁会话
- 返回 RemoteBrowserSession 代理对象

**实现示例：**
```typescript
export class RemoteSessionManager {
  private sessions = new Map<string, RemoteBrowserSession>();
  private browserServiceUrl: string; // http://127.0.0.1:7704

  async createSession(options: CreateRemoteSessionPayload): Promise<{ sessionId: string }> {
    const sessionId = options.sessionId || `session_${Date.now().toString(36)}`;

    // 通过 HTTP 调用 Browser Service 创建会话
    const response = await fetch(`${this.browserServiceUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        args: {
          profileId: sessionId,
          headless: options.headless,
          url: options.url
        }
      })
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to create remote session');
    }

    // 创建本地代理对象
    const remoteSession = new RemoteBrowserSession({
      sessionId,
      browserServiceUrl: this.browserServiceUrl
    });

    this.sessions.set(sessionId, remoteSession);
    return { sessionId };
  }

  getSession(sessionId: string): RemoteBrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.close();
    this.sessions.delete(sessionId);
    return true;
  }
}
```

### 3. Browser Service 命令接口

**位置：** `services/browser-service/index.ts`

**端口：** 7704

**命令格式：**
```typescript
// POST /command
{
  "action": string,
  "args": {
    "profileId": string,
    ...其他参数
  }
}
```

**响应格式：**
```typescript
{
  "success": boolean,
  "data"?: any,
  "error"?: string
}
```

**支持的命令：**

| action | args | 说明 | 返回 |
|--------|------|------|------|
| `start` | `{ profileId, headless?, url? }` | 启动会话 | `{ ok: true }` |
| `stop` | `{ profileId }` | 停止会话 | `{ ok: true }` |
| `getStatus` | - | 查询会话列表 | `{ sessions: [...] }` |
| `goto` | `{ profileId, url }` | 页面导航 | `{ ok: true }` |
| `evaluate` | `{ profileId, script }` | 执行脚本 | `{ result: any }` |
| `screenshot` | `{ profileId, fullPage? }` | 截图 | `{ base64: string }` |
| `click` | `{ profileId, selector }` | 点击元素 | `{ ok: true }` |
| `fill` | `{ profileId, selector, text }` | 填充表单 | `{ ok: true }` |
| `getCookies` | `{ profileId }` | 获取 cookies | `{ cookies: [...] }` |
| `saveCookies` | `{ profileId, path }` | 保存 cookies | `{ path, count }` |
| `loadCookies` | `{ profileId, path }` | 注入 cookies | `{ count }` |

## 集成点

### Unified API 集成

**位置：** `services/unified-api/server.ts`

```typescript
import { RemoteSessionManager } from './RemoteSessionManager.js';

// 创建远程会话管理器
const browserServiceUrl = `http://${defaultHttpHost}:${defaultHttpPort}`;
const sessionManager = new RemoteSessionManager({
  browserServiceUrl
});

// OperationExecutor 使用远程会话
const containerExecutor = new OperationExecutor(
  (sessionId) => {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found`);
    }
    return session.ensurePage(); // 返回 Page 代理对象
  },
  { info: ..., warn: ..., error: ... }
);
```

### OperationExecutor 兼容性

**位置：** `libs/containers/src/engine/OperationExecutor.ts`

OperationExecutor 通过 `getPage` 回调获取 Page 对象：

```typescript
export class OperationExecutor {
  constructor(
    private getPage: (sessionId: string) => any, // Page 或 Page 代理
    private logger?: any
  ) {}

  async execute(containerId, operationId, config, handle) {
    const page = this.getPage(handle.sessionId);
    
    // 使用 page.evaluate 执行操作
    // RemoteBrowserSession.createPageProxy() 返回的代理对象
    // 也有 evaluate 方法，内部转换为 HTTP 请求
    await page.evaluate(...);
  }
}
```

**Page 代理对象：**
```typescript
private createPageProxy(): any {
  return {
    evaluate: async (fn: any, ...args: any[]) => {
      return this.evaluate(fn.toString(), ...args);
    },
    url: () => this.getCurrentUrl() || '',
    mouse: {
      move: async (x, y, options?) => {
        return this.sendCommand('mouseMove', { x, y, ...options });
      },
      click: async (x, y, options?) => {
        return this.sendCommand('mouseClick', { x, y, ...options });
      }
    }
  };
}
```

## 通信流程

### 1. 会话创建流程

```
[Client]
  ↓ POST /v1/controller/action
  { action: 'browser:start', payload: { sessionId: 'weibo_fresh', url: '...' } }
  ↓
[Unified API - UiController]
  ↓ handleAction('browser:start', payload)
  ↓
[RemoteSessionManager]
  ↓ createSession({ sessionId, url })
  ↓ POST http://127.0.0.1:7704/command
  { action: 'start', args: { profileId: 'weibo_fresh', url: '...' } }
  ↓
[Browser Service - SessionManager]
  ↓ handleCommand('start', { profileId, url })
  ↓ new BrowserSession({ profileId })
  ↓ session.start(url)
  ↓ chromium.launchPersistentContext(...)
  ↓
[Response]
  ← { success: true }
  ↓
[RemoteSessionManager]
  ← new RemoteBrowserSession({ sessionId, browserServiceUrl })
  ← sessions.set(sessionId, remoteSession)
  ↓
[Client]
  ← { success: true, sessionId: 'weibo_fresh' }
```

### 2. 操作执行流程

```
[OperationExecutor]
  ↓ execute('weibo_main_page.feed_post', 'click', config, { sessionId: 'weibo_fresh' })
  ↓
[RemoteSessionManager]
  ↓ getSession('weibo_fresh')
  ↓
[RemoteBrowserSession]
  ↓ ensurePage()
  ↓ createPageProxy()
  ↓
[Page Proxy]
  ↓ evaluate('() => element.click()')
  ↓
[RemoteBrowserSession]
  ↓ sendCommand('evaluate', { script: '() => element.click()' })
  ↓ POST http://127.0.0.1:7704/command
  { action: 'evaluate', args: { profileId: 'weibo_fresh', script: '...' } }
  ↓
[Browser Service - SessionManager]
  ↓ getSession('weibo_fresh')
  ↓ session.evaluate('() => element.click()')
  ↓
[BrowserSession]
  ↓ page.evaluate('() => element.click()')
  ↓
[Playwright Page]
  ↓ 执行脚本
  ↓
[Response]
  ← { success: true, data: { result: ... } }
  ↓
[RemoteBrowserSession]
  ← return result
  ↓
[OperationExecutor]
  ← { success: true, data: ... }
```

## 性能考虑

### HTTP 请求开销

**问题：** 每次操作都发送 HTTP 请求，增加延迟

**优化方案：**
1. **批量操作：** 支持批量发送多个命令
   ```typescript
   POST /command/batch
   {
     "commands": [
       { "action": "evaluate", "args": {...} },
       { "action": "click", "args": {...} }
     ]
   }
   ```

2. **操作缓存：** 对高频操作（如 getCurrentUrl）使用本地缓存

3. **WebSocket 通道：** 对实时操作使用 WebSocket 减少握手开销

### 连接池

**问题：** 频繁创建 HTTP 连接

**优化方案：**
使用 undici 的连接池功能：
```typescript
import { Pool } from 'undici';

const pool = new Pool('http://127.0.0.1:7704', {
  connections: 10,
  pipelining: 5
});

// 使用连接池发送请求
const response = await pool.request({
  method: 'POST',
  path: '/command',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
```

## 错误处理

### 网络错误

```typescript
private async sendCommand(action: string, args?: any): Promise<any> {
  const maxRetries = 3;
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${this.baseUrl}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args: { profileId: this.sessionId, ...args } })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }

      return result.data || result;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  throw new Error(`Command failed after ${maxRetries} retries: ${lastError.message}`);
}
```

### 会话失效

```typescript
async ensurePage(url?: string): Promise<any> {
  // 先检查会话是否还存在
  try {
    await this.sendCommand('getStatus');
  } catch (error) {
    // 会话可能已过期，尝试重新创建
    throw new Error(`Session ${this.sessionId} expired: ${error.message}`);
  }

  if (url) {
    await this.goto(url);
  }
  return this.createPageProxy();
}
```

## 安全考虑

### 1. 认证与授权

```typescript
// Browser Service 可添加 API Key 认证
const response = await fetch(`${this.baseUrl}/command`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.BROWSER_SERVICE_API_KEY
  },
  body: JSON.stringify(payload)
});
```

### 2. 请求限流

```typescript
// Browser Service 端实现 rate limiting
const rateLimit = require('express-rate-limit');

app.use('/command', rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100 // 最多 100 个请求
}));
```

### 3. 脚本执行安全

```typescript
// evaluate 命令应验证脚本安全性
async evaluate(expression: string): Promise<any> {
  // 禁止危险操作
  if (expression.includes('require(') || expression.includes('import(')) {
    throw new Error('Script contains forbidden operations');
  }

  return this.sendCommand('evaluate', { script: expression });
}
```

## 测试

### 单元测试

```typescript
import { RemoteBrowserSession } from './RemoteBrowserSession';
import { fetch } from 'undici';

// Mock fetch
jest.mock('undici');

test('goto should send correct command', async () => {
  const session = new RemoteBrowserSession({
    sessionId: 'test-session',
    browserServiceUrl: 'http://localhost:7704'
  });

  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ success: true })
  });

  await session.goto('https://example.com');

  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:7704/command',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        action: 'goto',
        args: { profileId: 'test-session', url: 'https://example.com' }
      })
    })
  );
});
```

### 集成测试

```bash
# 启动 Browser Service
node libs/browser/remote-service.js --port 7704 &

# 运行集成测试
node scripts/test-remote-session.mjs
```

## 相关文档

- `docs/arch/EVENT_DRIVEN.md` - 事件驱动架构
- `docs/arch/AGENTS.md` - 整体架构设计
- `task.md` - 任务追踪与实现状态
