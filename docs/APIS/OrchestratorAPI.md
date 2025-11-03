# Orchestrator API 接口说明（端口 7700）

基础路径：`http://localhost:7700`

## 健康检查
- GET `/health`
  - 响应：
    ```json
    {
      "status": "ok" | "degraded" | "error",
      "uptime": 12345,
      "services": {
        "workflow": { "status": "ok", "port": 7701 },
        "vision": { "status": "ok", "port": 7702 }
      }
    }
    ```

## 服务控制
- POST `/restart/:service`
  - `:service` ∈ { `workflow`, `vision`, `all` }
  - 行为：强杀端口后重启对应服务，并等待 `/health` 就绪
  - 响应：`{ success: true }`

## 端口查询
- GET `/ports`
  - 响应：`{ success: true, ports: [{ port, inUse, pid? }] }`

