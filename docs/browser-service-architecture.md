# Browser Service 架构与用法（REST）

## 目标
- 后台常驻服务，通过 REST API 统一：
  1) 直接控制浏览器
  2) 在当前上下文执行工作流
  3) 抓取并分析当前页面（原始 DOM、脚本清单、容器化结构化结果）

## 目录位置
- 服务入口：`sharedmodule/engines/api-gateway/server.ts`
- 控制器：
  - 浏览器：`controllers/browserController.ts`（已有）+ `controllers/browserExtraController.ts`
  - 会话：`controllers/sessionController.ts`（已有）
  - 工作流：`controllers/workflowController.ts`（已有）
  - 页面抓取：`controllers/pageController.ts`
  - 容器库：`controllers/containersController.ts`
  - 抽取：`controllers/extractController.ts`
- 执行内核：`src/core/workflow/*`（引擎/节点/执行器）
- 容器库：`container-library.json`

## 关键抽象
- Session：会话标识 `sessionId`，承载 Browser/Context/Page 指针。
- Page/Frame：所有操作默认在当前会话的当前 Page；可通过 `frame.{urlPattern|urlIncludes|name|index}` 定位子 Frame。
- Container：自定义页面区域，来自 `container-library.json` 或临时传入。
- Workflow：编排节点在会话上下文中执行（可带 Preflows/Anchors/记录）。

## 启动
```bash
npm run build:services
nohup node dist/sharedmodule/engines/api-gateway/server.js >/tmp/workflow-api.log 2>&1 &
# 健康检查
curl -s http://127.0.0.1:7701/v1/health
```

## REST 端点（精选）
- 会话
  - `GET /v1/sessions`
  - `POST /v1/sessions/start {sessionId}` / `POST /v1/sessions/close {sessionId}`
- 浏览器
  - `POST /v1/browser/navigate {sessionId,url}`
  - `POST /v1/browser/click {sessionId,selector|text|bbox}`
  - `POST /v1/browser/type {sessionId,selector,text}`
  - `POST /v1/browser/eval {sessionId,script}`
  - `GET  /v1/browser/url?sessionId=...`
  - `POST /v1/browser/tab/attach {sessionId,urlPattern}` / `POST /v1/browser/tab/close {sessionId,hostIncludes|urlPattern}`
- 工作流
  - `POST /v1/workflows/run {workflowPath|workflowConfig,sessionId?,parameters?,options?}`
  - `GET  /v1/workflows/status/:sessionId`
- 页面抓取
  - `GET /v1/page/snapshot?sessionId=...&frame[urlPattern]=...`
  - `GET /v1/page/html?sessionId=...`
  - `GET /v1/page/scripts?sessionId=...`
  - `GET /v1/page/text?sessionId=...`
- 容器/抽取
  - `GET  /v1/containers` / `POST /v1/containers/resolve` / `POST /v1/containers/validate` / `POST /v1/containers/highlight`
  - `POST /v1/extract/container {sessionId, container:{list, item{...}}}`
  - `POST /v1/extract/1688/search {sessionId}`（内置 1688 搜索模板）

## 容器库示例（container-library.json）
```json
{
  "cbu": {
    "website": "1688.com",
    "containers": {
      "search.list": { "selector": ".sm-offer-item, .offer-item, .sm-offer, [class*=offer]" },
      "search.item.title": { "selector": "h4 a, [class*=title] a, a[title]" },
      "search.item.price": { "selector": "[class*=price], [data-price]" },
      "search.item.img": { "selector": "img" },
      "search.item.offerUrl": { "selector": "a[href*='.1688.com/']" },
      "search.item.wangwangSpan": { "selector": "span.J_WangWang, span[class*=WangWang]" },
      "search.item.wangwangLink": { "selector": "span.J_WangWang a.ww-link" },
      "search.item.shopLink": { "selector": "a[href*='company.1688.com'], a[href*='page/index.htm']" }
    }
  }
}
```

## 容器化抽取示例
- 目标：在 1688 搜索页抽取前 20 个商品卡片的结构化字段。
```bash
curl -s -X POST http://127.0.0.1:7701/v1/extract/container \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"<sid>",
    "container":{
      "list":".sm-offer-item, .offer-item, .sm-offer, [class*=offer]",
      "item":{
        "title":"h4 a@text",
        "price":"[class*=price]@text",
        "img":"img@src",
        "offerUrl":"a[href*=.1688.com/]@href",
        "wangwang":"span.J_WangWang a.ww-link@href"
      }
    }
  }'
```

## 内置 1688 搜索抽取
```bash
curl -s -X POST http://127.0.0.1:7701/v1/extract/1688/search -H 'Content-Type: application/json' -d '{"sessionId":"<sid>"}'
```

## 设计说明
- 所有 API 默认执行在 `sessionId` 对应上下文；若未提供，工作流会创建新会话。
- Frame 选择统一通过 `frame.{urlPattern|urlIncludes|name|index}`；浏览器与抓取类 API 都支持。
- 抽取链路统一使用页面 JS evaluate（避免落地过多节点），同时保留 `DevEvalNode` 方便离线脚本注入。

