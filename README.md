# WebAuto

**跨平台浏览器自动化采集框架** — 支持 macOS / Windows / Linux。

基于 Camoufox (Playwright) 的浏览器自动化解决方案，提供小红书、微博等平台的采集能力。

---

## 🚀 核心功能

### 1. Always-On 模式（生产级持续采集）

**Producer-Consumer 架构**，支持 24/7 持续运行：

- **Producer（生产者）**：定时扫描热搜榜 / 关键词，自动发现新帖子并入队
- **Consumer（消费者）**：持续从队列取链接，执行采集、评论、点赞等操作
- **动态参数配置**：运行时可修改搜索关键词、点赞关键词，无需重启

```bash
# 启动 Producer（热搜模式）
webauto daemon task submit --detach -- xhs-producer \
  --profile xhs-qa-1 \
  --mode hot-search \
  --scan-interval 300 \
  --max-links-per-scan 20

# 启动 Consumer（持续消费）
webauto daemon task submit --detach -- xhs-consumer \
  --profile xhs-qa-1 \
  --do-comments true \
  --do-likes true \
  --like-keywords "厉害,真棒"

# 动态修改参数
webauto always-on config --keyword "AI视频" --like-keywords "震撼,期待"
```

### 2. 统一采集命令（Unified）

支持小红书和微博的统一命令接口：

```bash
# 小红书搜索采集
webauto xhs unified \
  --profile xiaohongshu-batch-1 \
  --keyword "seedance2.0" \
  --max-notes 100 \
  --do-comments true \
  --do-likes true \
  --like-keywords "真牛,厉害"

# 微博时间线采集
webauto weibo unified \
  --profile weibo-main \
  --task-type timeline \
  --target 50

# 微博用户主页深度挖掘
webauto weibo unified \
  --task-type user-profile \
  --user-ids 1234567890 \
  --target 200
```

### 3. 视频解析与内容分析

```bash
# 解析微博视频链接
webauto weibo video http://t.cn/AXIt31Y5

# 视频 + AI 内容分析
webauto weibo video -a http://t.cn/AXIt31Y5
```

### 4. Tab 轮转采集

- **自动预算管理**：每个 Tab 有独立的评论采集预算（默认 50 条）
- **断点续传**：预算耗尽时保存进度，切换 Tab 后恢复采集
- **覆盖率优化**：确保大评论帖完整采集

### 5. 健康检查与自动恢复

```bash
# Daemon 健康检查
webauto daemon health-check

# 输出：
# - browser-service 状态
# - 输入管道响应能力
# - Session 存活检测
# - Zombie workers 清理
# - Daemon spawn 能力验证
```

---

## 📦 安装

### 前置要求

- Node.js >= 18
- macOS / Windows / Linux
- 已安装 Camoufox

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/Jasonzhangf/webauto.git
cd webauto

# 安装依赖
npm install

# 确保 Camoufox 已安装
camo init

# 创建浏览器 profile
camo profile create xiaohongshu-batch-1
```

---

## 🖥️ 跨平台支持

### macOS

```bash
# 启动 Daemon（launchd 管理）
webauto daemon start

# 查看 Daemon 状态
webauto daemon status

# 停止 Daemon
webauto daemon stop
```

### Windows

```powershell
# 安装为 Windows Service（推荐）
npx node-windows-installer webauto

# 或手动启动
node bin/webauto.mjs daemon start

# 查看状态
node bin/webauto.mjs daemon status
```

### Linux

```bash
# Systemd 服务管理
sudo systemctl start webauto-daemon
sudo systemctl status webauto-daemon
```

---

## 📖 详细文档

| 文档 | 说明 |
|------|------|
| [架构设计](docs/arch/) | 分层架构、模块划分、跨平台设计 |
| [Always-On 模式](docs/arch/always-on-design.md) | Producer-Consumer 架构 |
| [Tab 轮转设计](docs/arch/tab-rotation-design.md) | 预算管理、断点续传 |
| [超时统一架构](docs/arch/timeout-unified-design.md) | CDP 拥堵修复 |
| [压力测试框架](docs/arch/stress-testing-framework-design.md) | L1/L2/L3 测试模块 |

---

## 🛠️ 开发指南

### 项目结构

```
webauto/
├── bin/webauto.mjs          # CLI 入口
├── apps/webauto/
│   ├── entry/               # 命令实现
│   │   ├── xhs-producer-runner.mjs   # Producer 入口
│   │   ├── xhs-consumer-runner.mjs   # Consumer 入口
│   │   └── lib/             # 共享库
│   └── resources/           # 资源文件
├── modules/camo-runtime/    # Camoufox Runtime（Vendor）
│   └── src/autoscript/
│       ├── shared/          # 跨平台共享模块
│       └── action-providers/# 平台特定操作
├── services/unified-api/    # HTTP API 服务
└── docs/arch/               # 架构文档
```

### 关键命令

```bash
# 开发模式
npm run dev

# 语法检查
npm run lint

# 构建生产版本
npm run build
```

---

## 📊 架构原则

1. **camo = 框架，无业务逻辑**
2. **webauto = 应用，包含业务代码**
3. **L0 shared → L1 providers → L2 runners** 分层清晰
4. **编排独立于底层**，便于多平台移植
5. **锚点驱动等待**，超时作为熔断保护
6. **手动 Camo → 自动 E2E**，两级验证

---

## 📝 更新日志

### v0.3.0 (2026-04-07)

- ✅ Always-On Producer-Consumer 模式
- ✅ 热搜榜自动提取（`--mode hot-search`）
- ✅ 动态参数配置
- ✅ Tab 轮转断点续传
- ✅ CDP 拥堵修复（Read Lock）
- ✅ 评论点赞匹配闭环验证
- ✅ Daemon 健康检查增强
- ✅ Windows 跨平台支持

---

## 📄 License

MIT

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
