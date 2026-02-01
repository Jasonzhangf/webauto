# 小红书搜索采集架构文档

## 概述

本目录包含小红书搜索采集的完整实现，采用模块化、函数化设计，每个模块职责单一、可复用。

## 设计原则

1. **模块化**：每个文件职责单一，不超过 500 行
2. **函数化**：核心逻辑抽取为独立函数，便于测试和复用
3. **可组合**：各模块可独立运行，也可编排组合
4. **状态驱动**：通过状态文件管理断点续传

## 目录结构

```, "search/",
├── ARCHITECTURE.md          # 本文档
├── REFACTOR_PLAN.md         # 拆分计划
├── README.md                # 使用说明
├── orchestrator.mjs          # 🎯 主调度器（~200行）
├── lib/
, "│   ├── state-manager.mjs   # 状态管理（~150行）", "│   ├── browser-helper.mjs   # 浏览器辅助函数（~200行）", "│   ├── delay-optimizer.mjs  # 延迟优化（~100行）", "│   └── url-helper.mjs       # URL处理（~100行）", "├── phase1/",
│   ├── check-services.mjs   # 服务健康检查（~100行）
│   └── ensure-login.mjs     # 登录态检查（~150行）
├── phase2/
, "│   ├── collect-list.mjs     # 列表采集主逻辑（~400行）", "│   ├── scroll-handler.mjs   # 滚动处理（~300行）", "│   └── item-collector.mjs   # 单条采集（~200行）", "├── phase3/",
│   ├── collect-detail.mjs   # 详情采集（~300行）
│   └── persist-content.mjs  # 内容落盘（~200行）
└── phase4/
, "    ├── collect-comments.mjs # 评论采集（~400行）", "    └── persist-comments.mjs # 评论落盘（~150行）", "```", 
, "## 模块职责", 
, "### orchestrator.mjs", 
, "**职责**：流程调度和参数解析", 
, "**主要函数**：", "- `parseArgs()` - 解析 CLI 参数", "- `main()` - 主流程编排", "- `runPhase()` - 通用 Phase 执行器", 
, "**输入**：", "- `--keyword <关键字>`", "- `--count <数量>`", "- `--env <环境>`", "- `--daemon` - 后台运行", 
, "**输出**：", "- 调用各 Phase 脚本", 
返回 0=成功
1
失败

---

### lib/state-manager.mjs

**职责**：状态持久化和恢复

**主要函数**：
- `loadState(keyword)` - 加载状态
- `saveState(keyword, state)` - 保存状态
- `updateProgress(keyword, phase, count)` - 更新进度
- `isNoteCompleted(noteId)` - 检查笔记是否完成

**数据结构**：
, "{", 
version": 1,
  "keyword": "雷军",
  "target": 200,
  "currentPhase": "phase2",
  "collected": 65,
  "completedNotes": ["noteId1", "noteId2"],
  "lastUpdatedAt": 1705432123456
}
```

---

### lib/browser-helper.mjs

**职责**：浏览器操作辅助函数

**主要函数**：
- `executeScript(script)` - 执行脚本
- `getCurrentUrl()` - 获取当前URL
- `waitForPageStage(stage, timeout)` - 等待页面状态
- `highlightElement(rect)` - 高亮元素

---

### phase2/collect-list.mjs

**职责**：列表采集主逻辑

**主要函数**：
- `async function collectList(keyword, target)` - 主入口
- `async function collectViewportItems()` - 采集视口内条目
- `async function scrollAndCollect()` - 滚动并采集

**流程**：
1. 确认在搜索页
2. 循环：
   - 采集视口内可见条目
   - 点击进入详情获取 xsec_token
   - 返回搜索列表
   - 滚动加载更多
3. 直到达到目标或无法继续

**输出**：
- `safe-detail-urls.jsonl`

---

### phase2/scroll-handler.mjs

**职责**：滚动逻辑和重试

**主要函数**：
- `async function scrollDown()` - 向下滚动
- `async function scrollUp()` - 向上滚动
- `async function scrollWithRetry()` - 带重试的滚动

**特性**：
- 每次滚动最多重试 3 次
- 第 2 次重试前向上回滚
- 第 3 次重试前等待 60 秒

---

### phase3/collect-detail.mjs

**职责**：详情页采集

**主要函数**：
- `async function collectDetail(noteId)` - 采集单条详情
- `async function extractContent()` - 提取正文
- `async function downloadImages()` - 下载图片

**输出**：
- `<noteId>/content.md`
- `<noteId>/images/*.jpg`

---

### phase4/collect-comments.mjs

**职责**：评论采集

**主要函数**：
- `async function collectComments(noteId)` - 采集评论
- `async function warmupComments()` - 预热评论
- `async function expandComments()` - 展开评论

**输出**：
- `<noteId>/comments.md`


## 数据流

```
┌─────────────┐
│ CLI Input   │
│ --keyword   │
│ --count     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ orchestrator    │
│ - parseArgs     │
│ - dispatch      │
└──────┬──────────┘
       │
       ├──► phase1/check-services
       │      └─► Unified API health
       │      └─► Browser Service health
       │
       ├──► phase1/ensure-login
       │      └─► 登录态检查
       │
       ├──► phase2/collect-list
       │      └─► 滚动 + 点击
       │      └─► safe-detail-urls.jsonl
       │
       ├──► phase3/collect-detail
       │      └─► 提取正文/图片
       │      └─► content.md + images/
       │
       └──► phase4/collect-comments
              └─► 展开评论
              └─► comments.md

状态文件（.collect-state.json）贯穿所有 Phase；唯一实现为 `modules/state`（脚本侧仅兼容转发）。

```

## 执行流程

### 1. 检查服务

```bash
node phase1/check-services.mjs
# 输出：{"unified_api": true, "browser_service": true}
# 退出码：0=在线, 1=离线
```

### 2. 确保登录

```bash
node phase1/ensure-login.mjs
# 输出：{"logged_in": true, "method": "anchor"}
# 退出码：0=已登录, 1=未登录
```

### 3. 采集列表

```bash
node phase2/collect-list.mjs --keyword "雷军" --target 200
# 输出：safe-detail-urls.jsonl
# 日志：实时进度
```

### 4. 采集详情

```bash
node phase3/collect-detail.mjs --keyword "雷军"
# 读取：safe-detail-urls.jsonl
# 输出：<noteId>/content.md + images/
```

### 5. 采集评论

```bash
node phase4/collect-comments.mjs --keyword "雷军"
# 读取：safe-detail-urls.jsonl
# 输出：<noteId>/comments.md
```

### 6. 完整流程（orchestrator）

```bash
# 前台
node orchestrator.mjs --keyword "雷军" --count 200

# 后台
node orchestrator.mjs --keyword "雷军" --count 200 --daemon
```

## 错误处理

### Phase 通用

- **服务离线**：退出并提示启动服务
- **未登录**：提示手动登录
- **参数错误**：提示正确用法

### Phase2 特定

- **滚动失败**：重试3次，回滚+等待
- **点击失败**：跳过该条，记录日志
- **URL 无效**：跳过该条

### Phase3 特定

- **详情加载超时**：跳过该条
- **图片下载失败**：记录但继续

### Phase4 特定

- **评论展开失败**：记录已采数量
- **风控检测**：停止采集

## 性能优化

### 已实施

- ✅ 滚动重试机制（避免卡死）
- ✅ 断点续传（状态持久化）
- ✅ 后台运行（daemon模式）

### 待优化

- [ ] 详情页超时机制（目标：<3s）
- [ ] 快速恢复（DOM轮询）
- [ ] 并发采集（多tab）

## 测试

### 单元测试

```bash
# 测试状态管理
node lib/state-manager.mjs --test

# 测试滚动处理
node phase2/scroll-handler.mjs --test
```

### 集成测试

```bash
# 小规模测试（3条）
node orchestrator.mjs --keyword "测试" --count 3

# 中规模测试（50条）
node orchestrator.mjs --keyword "手机" --count 50
```

## 监控

### 日志文件

- `~/.webauto/download/xiaohongshu/{env}/{keyword}/run.log`
- `~/.webauto/download/xiaohongshu/{env}/{keyword}/run-events.jsonl`

### 进度查看

```bash
# 查看实时日志
tail -f ~/.webauto/download/xiaohongshu/{env}/{keyword}/run.log

# 查看已采集数量
ls ~/.webauto/download/xiaohongshu/{env}/{keyword} | grep -E '^[0-9a-f]{24}$' | wc -l

# 查看状态文件
cat ~/.webauto/download/xiaohongshu/{env}/{keyword}/.collect-state.json
```

## 版本历史

- **v1.0** (2026-01-17): 初始架构设计
  - 模块化拆分
  - 函数化重构
  - 状态管理统一
  - 性能优化基础

## 维护指南

### 添加新的 Phase

1. 在对应 phaseX/ 目录创建脚本
2. 遵循 `< 500 行` 原则
3. 导出 `main()` 函数
4. 在 orchestrator.mjs 中注册

### 修改现有模块

1. 保持函数签名不变
2. 更新本文档的模块职责
3. 运行集成测试验证

### 性能调优

1. 在 `lib/delay-optimizer.mjs` 中调整参数
2. 在 `lib/state-manager.mjs` 中优化存储
3. 运行性能测试对比


---

**文档版本**: v1.0
**最后更新**: 2026-01-17
**维护者**: Codex
