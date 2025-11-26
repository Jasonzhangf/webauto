# TODO（实施清单）

## 文档与规划（本次）
- [x] 架构文档（docs/ARCHITECTURE.md）
- [x] API 文档（Workflow / Vision Proxy / Orchestrator）
- [x] 端口与环境（docs/PORTS.md）
- [x] 服务 README（services/*/README.md）
- [x] 任务跟踪系统（tasks/*）

## 第一阶段：基础服务落地
- [ ] Orchestrator 基础：端口强杀 + 启停子服务 + 健康聚合
- [ ] Workflow API：健康、会话管理、运行工作流（结束策略覆盖）
- [ ] Workflow API：浏览器直控端点（navigate/click/type/eval/url/highlight/screenshot）
- [ ] Vision Proxy：健康、识别代理、日志记录
- [ ] Vision Proxy：启动并健康监控 Python 服务

## 第二阶段：健壮性与可观测
- [ ] 统一结构化日志（文件滚动）
- [ ] 错误码与可读错误信息
- [ ] 超时/重试策略与熔断
- [ ] 运行中会话/引擎状态可视化（简易端点）

## 第三阶段：增强
- [ ] SessionRegistry 可选持久化（文件/DB）
- [ ] 鉴权/速率限制（如需）
- [ ] 识别服务切换真实模型

