# Workflow API 接口说明（端口 7701）

基础路径：`http://localhost:7701`

## 健康检查
- GET `/health`
  - 响应：`{ status: 'ok'|'starting'|'error', uptime, sessions: string[], running: boolean }`

## 会话管理
- GET `/sessions`
  - 列出已注册会话 ID
  - 响应：`{ success: true, sessions: string[], total: number }`

- POST `/sessions/start`
  - 请求：`{ browserOptions?: { headless?: boolean, viewport?: { width, height }, engine?: 'chromium'|'firefox'|'camoufox', userDataDirTemplate?: string } }`
  - 行为：创建/持久化一个会话（启动浏览器与上下文，打开空白页）
  - 响应：`{ success: true, sessionId }`

- POST `/sessions/close`
  - 请求：`{ sessionId: string }`
  - 行为：关闭该会话内浏览器与上下文
  - 响应：`{ success: true }`

## 运行工作流
- POST `/workflow/run`
  - 请求（两种传参方式择一）：
    - 指定路径：`{ workflowPath: string, parameters?: object, sessionId?: string, options?: { forcePersistSession?: boolean, forceNoCleanup?: boolean, skipPreflows?: boolean } }`
    - 直接配置：`{ workflowConfig: object, parameters?: object, sessionId?: string, options?: {...} }`
  - 行为：
    - 在运行前强制注入结束策略：
      - `persistSession = true`（默认）
      - `cleanup = false`（默认）
    - 未提供 `sessionId` 时将自动创建并注入
  - 响应：`{ success, results, variables, record?, endAnchorResult? }`

- GET `/workflow/status/:sessionId`
  - 行为：读取引擎状态与变量（若当前引擎按会话运行）
  - 响应：`{ state, variables, results, executionTime }`

## 浏览器直控（非工作流）
> 用于即时控制页面，绕过工作流节点；满足“需要直控端点”的诉求。

- POST `/browser/navigate`
  - 请求：`{ sessionId: string, url: string, waitUntil?: 'load'|'domcontentloaded'|'networkidle', timeoutMs?: number }`
  - 响应：`{ success: true, url }`

- POST `/browser/click`
  - 请求：`{ sessionId: string, selector?: string, bbox?: { x1,y1,x2,y2 }, text?: string, clickOptions?: { button?: 'left'|'right'|'middle', clickCount?: number } }`
  - 行为：
    - `selector` 优先；若无则按 `bbox`（居中点）；若有 `text` 可辅助做基于可见文本的定位（可选）
  - 响应：`{ success: true }`

- POST `/browser/type`
  - 请求：`{ sessionId: string, selector: string, text: string, delay?: number }`
  - 响应：`{ success: true }`

- POST `/browser/eval`
  - 请求：`{ sessionId: string, script: string }`
  - 行为：在页面上下文执行脚本（字符串形式，调用方需自担安全性）
  - 响应：`{ success: true, value: any }`

- GET `/browser/url`
  - 查询：`?sessionId=xxx`
  - 响应：`{ success: true, url }`

- POST `/browser/highlight`
  - 请求：`{ sessionId: string, selector?: string, bbox?: { x1,y1,x2,y2 }, color?: string, label?: string, durationMs?: number }`
  - 行为：利用已注入的 `highlight-service.js` 在页面显示高亮
  - 响应：`{ success: true }`

- POST `/browser/screenshot`
  - 请求：`{ sessionId: string, fullPage?: boolean }`
  - 响应：`{ success: true, image: 'data:image/png;base64,...', timestamp }`

## 错误格式
- `{ success: false, error: string, code?: string }`

