# Xiaohongshu Scripts

## 📦 当前架构（已完成 Phase1-4 容器化 + Debug 模式）

### 统一入口
```bash
# 一个命令跑完所有阶段（单 profile）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug --profile xiaohongshu_fresh

# 一个命令跑完所有阶段（profilepool，Phase2 自动取第一个）
node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug --profilepool xiaohongshu_batch

# Debug 模式：每步高亮容器 + 截图回放（仅 workflow 版本）
debug/node scripts/xiaohongshu/search/orchestrator.mjs --keyword "手机膜" --target 20 --debug

# 断点恢复（失败后继续）
node scripts/xiaohongshu/search/orchestrator.mjs --keyword "手机膜" --resume
```

### 模块化 Phase 脚本

| Phase | 模块 | 职责 | 容器化 | Debug | 状态管理 |
|-------|------|------|--------|--------|----------|
| **Phase1** | `search/phase1/(check-services, ensure-login)` | 服务检查 + 容器驱动登录 | ✅ | ✅ | N/A |
| **Phase2** | `search/phase2/collect-list.mjs` | SearchGate + 列表采集 | ✅ | ✅ | ✅ 记录 safe-detail-urls |
| **Phase3** | `search/phase3/collect-detail.mjs` | 容器点击详情页 + xsec_token 校验 | ✅ | ✅ | ✅ 记录 completedNoteIds |
| **Phase4** | `search/phase4/collect-comments.mjs` | 评论采集 + 落盘 | ✅ | ✅ | ✅ 记录 failedNoteIds |
| **状态** | `modules/state`（唯一实现） | 断点恢复、统计、兼容迁移 | N/A | N/A | ✅ .collect-state.json |
| **日志** | `search/lib/logger.mjs` | 统一日志 + JSONL 事件流 | N/A | N/A | ✅ run-events.jsonl |

## 🎯 关键特性

1. **容器化**：所有操作基于 `container:operation`（点击/提取/滚动/高亮）
2. **xsec_token 安全**：🔗 详情页仅通过容器点击进入，禁止 URL 拼接
3. **SearchGate 节流**：📋 同一 Profile 60s 窗口内最多 2 次搜索
4. **Debug 回放**：📸 每步高亮容器 + 截图，文件名：`debug.{phase}.{step}.png`
5. **断点恢复**：💾 中断后可 `--resume` 继续，状态落盘于 `~/.webauto/download/{env}/{keyword}/`
6. **多 Tab 采集**：🚀 Phase4 支持 4 个 Tab 并发滚动捕获评论（50 条/轮次）

## 📁 输出目录规范

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── .collect-state.json          # 采集状态（可删后重跑）
├── run.{timestamp}.log          # 运行日志
├── run-events.{timestamp}.jsonl # 事件流（JSON Lines）
├── debug.{phase}.{step}.png     # Debug 截图（仅 --debug）
└── {noteId}/                    # 每条笔记一个子目录
    ├── README.md               # 正文内容（含图片相对路径）
    ├── images/                 # 原始图片（{index}.{ext}）
    └── comments.md             # 评论列表（Markdown）
```

## 🔍 断点恢复流程

```bash
# 中断后查看状态（摘要）
node scripts/xiaohongshu/state.mjs show --keyword "手机膜" --env debug

# 从断点继续（自动跳过已完成）
node scripts/xiaohongshu/search/orchestrator.mjs --keyword "手机膜" --resume --debug

# 失败后重跑（保留失败记录）
rm ~/.webauto/download/xiaohongshu/debug/手机膜/.collect-state.json
node scripts/xiaohongshu/search/orchestrator.mjs --keyword "手机膜" --debug
```

## 🔧 测试脚本（旧）

- `tests/`: 原子化调试脚本（Phase1 登录守护、Phase2 搜索验证等）
- `integration/`: 工作流/集成脚本（以上新模块已替代）

### 旧入口（已弃用）
```bash
# 查看当前状态
node scripts/xiaohongshu/tests/status.mjs

# 启动/复用会话并等待登录
node scripts/xiaohongshu/tests/phase1-session-login.mjs

# 搜索页验证
node scripts/xiaohongshu/tests/phase2-search.mjs
```

## 📊 结果校验流程（计划中）

1. 校验图片数量 vs README.md 中引用数量
2. 校验评论总数 vs `comments.md` 实际条目
3. 文件哈希一致性检查
4. 缺失/损坏条目自动重试

## ⚠️ 技术规则

- 单平台单会话：`xiaohongshu_fresh`（复用原则：先查后创）
- 禁止 URL 直跳：仅容器点击（保护 `xsec_token`）
- 统一系统级操作：`container:operation`（点击/滚动/输入）
- 每步可见约束：元素必须在视口内（Rect 校验）
- 日志唯一真源：`run-events.jsonl`（结构化 + 时间序）
