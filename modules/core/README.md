# Core 模块

提供统一状态总线、配置管理、错误处理和 CLI 规范，为 WebAuto 扁平化架构提供基础能力。

## 结构

- `src/state-bus.mjs`：统一状态总线，支持事件订阅与广播
- `src/config-center.mjs`：集中配置管理，支持运行时覆盖
- `src/error-handler.mjs`：统一错误处理与日志输出
- `cli.mjs`：Core CLI，提供全局状态查看和配置管理

## 使用

```bash
# 查看所有模块状态
node modules/core/cli.mjs status

# 更新配置
node modules/core/cli.mjs config set ports.browser 7705

# 清理日志
node modules/core/cli.mjs logs clean
```
