# WebAuto 模块使用手册

> 自动生成于 2025-12-20T07:47:06.772Z

## 概述

WebAuto 采用扁平化架构，各模块独立 CLI，通过统一状态总线交互。

## 模块列表

## CORE 模块

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


### CLI 使用
```bash

用法: node cli.mjs <command> [args]

命令:
  status           查看全局状态
  config get       获取配置（可指定路径）
  config set       设置配置项
  config reset     重置为默认
  logs recent      查看最近错误
  logs stats       错误统计（24h）
  logs clean       清理旧日志
  health           统一健康检查
  broadcaster [port] 启动状态广播 WebSocket 服务
  help             显示本帮助

```

### 状态总线事件
- 注册：`module:registered`
- 注销：`module:unregistered`
- 状态变化：`state:changed`

---
## BROWSER 模块

# Browser 模块

提供浏览器会话管理、Cookie 注入与容器匹配的独立 CLI。

## 使用

```bash
# 启动
node modules/browser/cli.mjs start --profile weibo_fresh --headless

# 停止
node modules/browser/cli.mjs stop --profile weibo_fresh

# 查看状态
node modules/browser/cli.mjs status

# 健康检查
node modules/browser/cli.mjs health
```


### CLI 使用
```bash

用法: node cli.mjs <command> [选项]

命令:
  start --profile <id> [--url <url>] [--headless]   启动浏览器会话
  stop --profile <id>                               停止会话
  status                                            查看状态
  health                                            健康检查
  help                                              显示本帮助

示例:
  node cli.mjs start --profile weibo_fresh --url https://weibo.com

```

### 状态总线事件
- 注册：`module:registered`
- 注销：`module:unregistered`
- 状态变化：`state:changed`

---
## WORKFLOW 模块



### CLI 使用
```bash
暂无帮助信息
```

### 状态总线事件
- 注册：`module:registered`
- 注销：`module:unregistered`
- 状态变化：`state:changed`

---
## CONTROLLER 模块



### CLI 使用
```bash
暂无帮助信息
```

### 状态总线事件
- 注册：`module:registered`
- 注销：`module:unregistered`
- 状态变化：`state:changed`

---
## UI 模块



### CLI 使用
```bash
暂无帮助信息
```

### 状态总线事件
- 注册：`module:registered`
- 注销：`module:unregistered`
- 状态变化：`state:changed`

---

## 快速开始

```bash
# 启动所有服务
node scripts/launch-with-ui.mjs

# 查看全局状态
node modules/core/cli.mjs status

# 健康检查
node modules/core/cli.mjs health

# 启动特定模块
node modules/browser/cli.mjs start --profile weibo_fresh --url https://weibo.com
```

## 状态总线

状态总线地址：`ws://127.0.0.1:8790`

事件格式：
```json
{
  "timestamp": 1234567890,
  "event": "state:changed",
  "data": {
    "module": "browser",
    "prev": { "status": "stopped" },
    "now": { "status": "running", "sessionId": "weibo_fresh" }
  }
}
```

## 性能指标

- 启动时间：< 30 秒
- 状态同步：< 1 秒
- 模块新增：< 1 小时
- 调试定位：< 10 分钟
