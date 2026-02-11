# ProfileGate Service

类似 search-gate 的 profile 资源池服务。

## 职责
- 统一管理所有可用 profile（xiaohongshu_batch-1, xiaohongshu_batch-2）
- 预检 cookie 有效性和登录状态
- 分配/回收 profile token
- 心跳保活和自动失效检测

## API

### POST /request
申请 profile，返回分配结果和 token

### POST /release
释放 profile，归还资源池

### POST /heartbeat
保活，更新 profile 最后使用时间

## 应用层约束
所有脚本启动前必须先调用 ProfileGate 申请 profile，禁止直接使用 --profile 参数。
