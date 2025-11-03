# Vision Proxy API 接口说明（端口 7702）

基础路径：`http://localhost:7702`

> 说明：Vision Proxy 为 Node 层代理，负责请求日志记录与将调用转发至 Python 识别服务（默认 `http://127.0.0.1:8899`）。Proxy 启动时会自动拉起并健康校验 Python 服务。

## 健康检查
- GET `/health`
  - 响应：`{ status: 'ok'|'degraded'|'error', uptime, python: { reachable: boolean, modelLoaded?: boolean, version?: string } }`

## 识别接口
- POST `/recognize`
  - 请求：
    ```json
    {
      "image": "data:image/png;base64,...",
      "query": "识别页面中的登录按钮",
      "scope": "full" | "partial",
      "region": { "x":0, "y":0, "width":800, "height":600 },
      "parameters": { "temperature": 0.1, "maxTokens": 512 }
    }
    ```
  - 响应（透传标准化）：
    ```json
    {
      "success": true,
      "elements": [{ "bbox":[x1,y1,x2,y2], "text":"...", "type":"button", "confidence":0.95 }],
      "actions": [{ "type":"click", "target":{"bbox":[...]}, "reason":"..." }],
      "analysis": "...",
      "metadata": { "model":"Tongyi-MiA/UI-Ins-7B", "processingTime": 1234, "confidence": 0.9 }
    }
    ```

## 日志
- Proxy 记录：请求开始/结束、耗时、错误；可输出到控制台与文件（后续可配置）。

## 错误格式
- `{ success: false, error: string }`

