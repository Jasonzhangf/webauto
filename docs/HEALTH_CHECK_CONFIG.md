# 自检系统配置说明

## 🎯 概述

现在 WebAuto 系统会在以下场景自动运行健康检查：

1. **编译后** - `npm run build` 会自动执行编译后自检
2. **启动时** - `npm run browser:oneclick` 会自动执行启动前健康检查

## 🔧 配置选项

在 `config/browser-service.json` 中配置：

```json
{
  "host": "0.0.0.0",
  "port": 7704,
  "backend": { "baseUrl": "http://127.0.0.1:7701" },
  "healthCheck": {
    "autoCheck": true,           // 是否自动检查（默认：true）
    "strictMode": false,         // 严格模式（发现问题直接退出，默认：false）
    "skipOnFirstSuccess": true,  // 首次成功后跳过后续检查（默认：true）
    "timeout": 30000             // 检查超时时间（毫秒，默认：30000）
  }
}
```

## 🚀 使用方式

### 1. 编译后自动自检
```bash
npm run build
```
编译完成后会自动运行 `npm run self-check:post-build`

### 2. 启动时自动自检
```bash
npm run browser:oneclick
```
启动前会自动运行健康检查，发现问题会询问用户是否继续

### 3. 手动控制自检行为

```bash
# 跳过健康检查启动
npm run browser:oneclick:no-check

# 只运行健康检查，不启动
npm run browser:oneclick:health-only

# 严格模式启动（有问题直接退出）
npm run browser:oneclick:strict

# 完整自检
npm run self-check

# 快速自检
npm run self-check:quick
```

## 📋 自检项目

### 编译后自检
- ✅ 系统依赖 (Node.js, npm, Python 3)
- ✅ 构建产物完整性
- ✅ 依赖完整性
- ✅ 配置文件格式

### 启动前自检
- ✅ 端口占用情况
- ✅ 服务健康状态
- ✅ WebSocket 连接
- ✅ 容器匹配功能
- ✅ 基础功能测试

## ⚙️ 环境变量控制

```bash
# 强制严格模式
WEBAUTO_STRICT_CHECK=1 npm run browser:oneclick

# 禁用自动检查
WEBAUTO_DISABLE_HEALTH_CHECK=1 npm run browser:oneclick
```

## 🔍 故障处理

### 场景 1: 编译后自检失败
```bash
# 1. 查看具体问题
npm run self-check:post-build

# 2. 尝试自动修复
npm run self-check:fix

# 3. 重新编译
npm run build
```

### 场景 2: 启动时自检失败
```bash
# 1. 查看健康检查详情
npm run health-check

# 2. 如果是端口问题，释放端口
lsof -i :8765  # 查看占用进程
kill <PID>     # 停止进程

# 3. 跳过检查启动（不推荐）
npm run browser:oneclick:no-check
```

### 场景 3: 需要详细诊断
```bash
# 1. 运行完整自检
npm run self-check

# 2. 运行分阶段健康检查
npm run health-check:stage dependency
npm run health-check:stage service

# 3. 使用增强启动工具
npm run launch:diagnose
```

## 📝 最佳实践

### 开发环境
```bash
# 正常启动，接受交互式提示
npm run browser:oneclick
```

### 生产环境
```bash
# 严格模式，确保系统健康
npm run browser:oneclick:strict

# 或者先手动检查，确认健康后再启动
npm run health-check:quick && npm run browser:oneclick:no-check
```

### CI/CD 环境
```bash
# 编译阶段
npm run build

# 部署前检查
npm run self-check:quick

# 启动服务（严格模式）
WEBAUTO_STRICT_CHECK=1 npm run browser:oneclick
```

## ⚡ 性能优化

如果觉得自动检查影响启动速度，可以：

1. **配置中关闭自动检查**
```json
{
  "healthCheck": {
    "autoCheck": false
  }
}
```

2. **使用快速启动命令**
```bash
npm run browser:oneclick:no-check
```

3. **只在关键时机检查**
```bash
# 每天第一次启动时检查
if [ ! -f ~/.webauto/last_health_check ] || [ $(find ~/.webauto/last_health_check -mtime +1) ]; then
  npm run health-check:quick
  date > ~/.webauto/last_health_check
fi
npm run browser:oneclick:no-check
```

---

**提示**: 自检系统设计为非侵入式，默认情况下会提供友好的交互体验，同时在需要时提供严格的验证机制。