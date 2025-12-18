# WebAuto 健康检查和自检系统指南

本文档介绍 WebAuto 系统的健康检查和自检功能，帮助您快速诊断和解决问题。

## 📋 概述

WebAuto 提供了三个核心工具来确保系统健康运行：

1. **统一自检工具** - 完整系统健康检查
2. **分阶段健康检查** - Floating Console 启动诊断
3. **增强启动工具** - 带诊断的智能启动

## 🚀 快速开始

### 1. 完整系统自检
```bash
npm run self-check
```

### 2. 快速健康检查
```bash
npm run health-check
```

### 3. 智能启动（带诊断）
```bash
npm run launch:diagnose
```

## 🔧 详细使用说明

### 统一自检工具 (self-check)

**功能**: 检查系统依赖、项目结构、配置文件、端口占用、构建状态等

**命令**:
```bash
# 完整自检
npm run self-check

# 快速自检（跳过部分检查）
npm run self-check:quick

# 自动修复（尝试修复发现的问题）
npm run self-check:fix
```

**检查项目**:
- ✅ 系统依赖 (Node.js, npm, Python 3)
- ✅ 项目结构 (目录和关键文件)
- ✅ 配置文件 (JSON 格式验证)
- ✅ Cookie 文件 (格式和内容)
- ✅ 端口占用情况
- ✅ 构建产物完整性
- ✅ 依赖完整性
- ✅ Floating Console 状态

### 分阶段健康检查 (health-check)

**功能**: 专门用于 Floating Console 启动过程的分阶段诊断

**命令**:
```bash
# 完整健康检查
npm run health-check

# 快速检查
npm run health-check:quick

# 指定阶段检查
npm run health-check:stage dependency    # 依赖检查
npm run health-check:stage port          # 端口检查
npm run health-check:stage service       # 服务健康
npm run health-check:stage websocket     # WebSocket 连接
npm run health-check:stage container     # 容器匹配
npm run health-check:stage functional    # 功能测试
```

**检查阶段**:
1. **依赖检查** - 验证系统依赖和目录结构
2. **端口检查** - 检查端口占用情况
3. **服务健康** - 验证后端服务状态
4. **WebSocket** - 测试 WebSocket 连接
5. **容器匹配** - 检查容器定义和匹配
6. **功能测试** - 执行基本功能测试

### 增强启动工具 (launch:diagnose)

**功能**: 启动前诊断 + 智能错误处理 + 用户反馈

**命令**:
```bash
# 标准启动（带诊断）
npm run launch:diagnose

# 启动带 UI（非无头模式）
npm run launch:diagnose:ui

# 开发模式启动
npm run launch:diagnose:dev
```

**启动流程**:
1. **运行诊断** - 检查所有前置条件
2. **用户确认** - 发现问题时询问是否继续
3. **分步启动** - 浏览器服务 → 会话 → 控制台
4. **结果验证** - 验证启动是否成功
5. **错误处理** - 自动清理和恢复

## 🛠️ 参数说明

### 自检工具参数
```bash
--quick  # 跳过部分检查，加快速度
--fix    # 尝试自动修复发现的问题
```

### 健康检查参数
```bash
--quick                # 跳过非关键检查
--stage <stage_name>   # 只运行指定阶段
```

### 启动工具参数
```bash
--profile <name>       # 指定 profile 名称
--url <url>            # 指定启动 URL
--headless=false       # 显示 UI 界面
--dev                  # 开发模式
```

## 📊 输出解读

### 成功输出示例
```
✅ 依赖: Node.js v18.17.0
✅ 依赖: npm v9.6.7
✅ 目录: apps/floating-panel
✅ 端口: Browser Service (7704): 可用
✅ 服务: Workflow API: 健康
✅ WebSocket: 连接成功
```

### 失败输出示例
```
❌ 依赖: Python 3: 未找到
⚠️  端口: WebSocket (8765): 被占用
❌ 构建产物: 缺少 2 个文件

=== 修复建议 ===
1. 安装 Python 3 并确保其在 PATH 中
2. 检查并释放端口 8765 或修改配置
3. 运行 npm run build:services 重新构建
```

## 🔍 故障排查

### 常见问题 1: 端口被占用
```bash
# 检查端口占用
lsof -i :8765

# 强制释放端口
kill -9 <PID>

# 或使用脚本
npm run service:kill-port -- 8765
```

### 常见问题 2: 构建缺失
```bash
# 重新构建
npm run build:services

# 验证构建
npm run verify
```

### 常见问题 3: 依赖未安装
```bash
# 安装根目录依赖
npm install

# 安装 Floating Console 依赖
cd apps/floating-panel && npm install
```

### 常见问题 4: 配置错误
```bash
# 检查配置文件
cat config/browser-service.json

# 验证 JSON 格式
node -e "JSON.parse(require('fs').readFileSync('config/browser-service.json', 'utf8'))"
```

## 📝 日志文件

健康检查和启动过程会生成详细日志，位置如下：

```
~/.webauto/logs/
├── daemon.log          # 守护进程日志
├── browser-service.log # 浏览器服务日志
├── floating-panel.log  # 浮动控制台日志
└── health-check.log    # 健康检查日志
```

查看最近的错误：
```bash
npm run health  # 运行时错误聚合检查
```

## 🎯 最佳实践

### 1. 日常使用
```bash
# 启动前检查
npm run health-check:quick

# 如果通过，正常启动
npm run browser:oneclick
```

### 2. 部署前检查
```bash
# 完整系统自检
npm run self-check

# 如果发现问题，尝试自动修复
npm run self-check:fix

# 再次验证
npm run self-check
```

### 3. 问题诊断
```bash
# 1. 运行完整自检
npm run self-check

# 2. 运行健康检查
npm run health-check

# 3. 使用增强启动
npm run launch:diagnose
```

### 4. 开发调试
```bash
# 开发模式启动
npm run launch:diagnose:dev

# 检查特定阶段
npm run health-check:stage websocket
```

## 🔧 高级配置

### 自定义健康检查阈值
可以修改脚本中的超时时间、检查频率等参数：

```javascript
// 在 health-check.mjs 中
const config = {
  timeouts: {
    port: 2000,
    service: 15000,
    websocket: 8000
  }
};
```

### 添加自定义检查
可以在 `self-check.mjs` 的 `Checkers` 对象中添加新的检查器：

```javascript
Checkers.checkMyFeature = async (collector) => {
  // 你的检查逻辑
  collector.addCheck('我的功能', 'pass', '检查通过');
};
```

## 📞 获取帮助

如果健康检查工具无法解决您的问题：

1. 查看详细日志文件
2. 运行 `npm run health` 检查运行时错误
3. 检查 `docs/TROUBLESHOOTING.md`
4. 提供完整的自检输出到 issue

---

**最后更新**: 2025-12-17  
**版本**: v1.0