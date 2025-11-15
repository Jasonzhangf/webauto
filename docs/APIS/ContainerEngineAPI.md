# Container Engine API（端口 7703）

基础路径：`http://localhost:7703`

说明：容器引擎以“服务”形式运行，负责根锚点检测、树状发现、运行与焦点高亮。通过上下文 contextId 进行接力，便于与 Workflow 编排引擎解耦。

## 健康检查
- GET `/health`
  - 响应：`{ status, uptime, contexts }`

## 上下文（Context）
- POST `/v1/containers/context/create`
  - 请求：
    ```json
    {
      "sessionId": "S-xxx",                    // Workflow API 的浏览器会话
      "rootDef": { ... },                       // ContainerDefV2，含 anchors/selectors/children
      "overlay": { "id": "wf-1", "rootId": "...", "overrides": [ ... ] },
      "defs": [ { ... }, { ... } ]              // 其他子容器定义，可选
    }
    ```
  - 行为：
    1) 通过 `rootDef.anchors|selectors` 在页面检测根容器；
    2) 若命中，启动引擎：从根出发进行一层子容器发现，构建容器图，焦点绿色高亮（非阻塞）；
    3) 返回 `contextId`。
  - 响应：`{ success, contextId, started }`

  - 最小示例（root + child）：
    ```json
    {
      "sessionId": "S-123",
      "rootDef": {
        "id": "search_page",
        "name": "搜索页",
        "selectors": [{ "classes": ["page-root"] }],
        "anchors": [{ "classes": ["search", "container"] }],
        "children": ["result_list"]
      },
      "defs": [
        {
          "id": "result_list",
          "name": "结果列表",
          "selectors": [{ "classes": ["result-list"] }],
          "operations": [{ "type": "find-child" }],
          "pagination": { "mode": "scroll", "maxSteps": 5 }
        }
      ]
    }
    ```

- GET `/v1/containers/context/:id/graph`
  - 响应：`{ success, graph: { nodes, edges } }`

- GET `/v1/containers/context/:id/focus`
  - 响应：`{ success, focus }`（当前焦点容器 id）

说明：本服务默认通过本机 `PORT_WORKFLOW` 访问 Workflow API 的浏览器端点（eval/highlight/mouse）。

## 接力（Relay by Context）
- Workflow 引擎获取 `contextId` 后，可在自身流程中携带该 `contextId` 与 `sessionId`，调用 Container Engine 的接口（查询图、定位目标、触发下一步）。
- 容器=砖块：只提供定位与操作原语；Workflow=编排：只关心步骤与目标。二者通过 `contextId` 解耦对接。

## 环境变量
- `PORT_CONTAINER`：Container Engine 端口，默认 7703
- `PORT_WORKFLOW`：Workflow API 端口，默认 7701（用于浏览器操作）
