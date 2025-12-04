# WebAuto 模块化架构

为了将 UI、服务及底层自动化能力彻底解耦，我们引入“功能模块 (modules)” 层：

```
UI (Floating Panel / CLI wrappers)
        ↓
Control Plane Services (WebSocket / HTTP)
        ↓
Modules (browser-control / session-manager / container-matcher / ...)
        ↓
外部依赖（Playwright、Chrome、文件系统等）
```

## 设计目标

1. **函数化**：服务层仅负责参数校验与编排，真正的业务逻辑位于模块层，可直接做 CLI/单元测试。
2. **CLI 化**：每个模块可通过命令行调用，方便本地调试、自动化脚本以及 CI 验证。
3. **可插拔**：新 Operation、容器仓库或浏览器实现都通过模块扩展，无需修改 UI。
4. **统一存储**：容器库、profile、session 等持久化内容全部迁移至 `~/.webauto`，开发目录只保留代码。

## 模块职责概览

| 模块 | 职责 | CLI 示意 |
| --- | --- | --- |
| browser-control | 启/停浏览器、Profile 独占 | `bin/browser launch --profile weibo-fresh` |
| session-manager | WebSocket/自动化会话管理 | `bin/session create --capabilities dom` |
| container-registry | 读取 & 更新容器定义库 | `bin/container list --url https://weibo.com` |
| container-matcher | 匹配根容器、抓取 DOM/容器树 | `bin/container matcher inspect --url ...` |
| operations | 定义滚动、点击、highlight 等原子操作 | `bin/operation run --op scroll` |
| operation-selector | 根据容器/DOM 状态推荐操作 | `bin/operation suggest --container weibo_main_page` |
| storage | Profile / Cookie / 指纹等持久化接口 | `bin/storage profile backup --id weibo-fresh` |
| logging | 统一日志、事件上报、调试工具 | `bin/log stream --session weibo-fresh` |

## 迁移路线

1. **目录搭建 & 文档**：当前步骤，明确模块职责与分层规则。
2. **迁移成熟模块**：优先将 `container-registry`、`container-matcher` 搬入 `modules/` 并暴露 CLI。
3. **Operation 体系重构**：实现基础 Operation 执行器 + selector + registry。
4. **服务层瘦身**：WS/HTTP 服务仅调用模块函数或 CLI，移除内嵌业务逻辑。
5. **UI Wrapper 化**：浮窗只负责展示/触发命令，所有操作通过服务/CLI 完成。
6. **CI 覆盖**：`npm test` 执行所有模块的静态检查与单元测试，GitHub Actions 默认跑 CI。

后续的每一次模块迁移，都需要：
- README 描述输入/输出；
- CLI 命令说明；
- 至少一个测试用例；
- 服务层或脚本的调用路径同步调整。
