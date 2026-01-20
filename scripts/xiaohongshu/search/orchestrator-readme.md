# 小红书爬取脚本编排器 (Orchestrator)

## 当前实现

**重要：`orchestrator.mjs` 目前只是 `phase1-4-full-collect.mjs` 的软链接/包装器。**

phase1-4-full-collect.mjs 是经过 7000 行代码打磨的稳定全流程脚本，包含完整的 Phase 1-4 逻辑：

- **Phase 1**: 确保服务在线 + 登录检查
- **Phase 2**: 列表采集 → 生成 `safe-detail-urls.jsonl`
- **Phase 3-4**: 4-Tab 并发详情+评论采集 → 落盘到 `~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/`

## 使用方法

```bash
# 直接使用 phase1-4-full-collect.mjs
node scripts/xiaohongshu/tests/phase1-4-full-collect.mjs --keyword "雷军" --target 50 --env prod --headless

# 可选参数：
# --keyword, -k: 搜索关键字
# --target, -t: 目标数量 (默认 200)
# --env, -e: 环境 (download/prod/debug)
# --headless: headless 模式
# --fresh: 清空历史数据重新采集
```

## 产物目录结构

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── {noteId}/
│   ├── content.md         # 帖子正文、标题、图片引用
│   ├── comments.md        # 评论列表（Markdown格式）
│   ├── comments.jsonl     # 评论原始数据（JSONL增量存储）
│   └── images/            # 图片目录
│       ├── 01.jpg
│       └── 02.jpg
├── safe-detail-urls.jsonl # Phase2 产物：带 xsec_token 的详情链接
└── run.*.log              # 采集日志
```

## 实现细节（来自 phase1-4-full-collect.mjs）

### Phase 2: 列表采集
- 使用 `CollectSearchListBlock` 滚动搜索结果页
- 通过容器操作逐条打开详情页获取带 `xsec_token` 的 URL
- 落盘到 `safe-detail-urls.jsonl`（防止直连触发风控）

### Phase 3-4: 4-Tab 并发
- 固定使用 tab index=1,2,3,4 轮询处理
- 每个 note 采集流程：
  1. 导航到详情页（使用 safe URL）
  2. ExtractDetailBlock → 提取正文/图片
  3. CollectCommentsBlock → 增量采集评论（最多 50 条/轮）
  4. PersistXhsNoteBlock → 落盘 content.md + comments.md

### 节流与风控
- **SearchGate**: 全局搜索节流（默认每分钟2次）
- **详情页打开**: 每 10 秒打开一个详情页
- **评论采集**: 滚动间隔 1.5-3 秒，避免高频请求

## 状态恢复（Resume）

脚本自动检测：
- `safe-detail-urls.jsonl` 存在 → 跳过 Phase2
- `{noteId}/comments.md` 存在 → 跳过该 note
- `{noteId}/comments.jsonl` 存在 → 断点续传评论采集

## 当前问题

orchestrator.mjs 之前尝试自己实现流程，导致：
- ExtractDetailBlock 未被正确调用
- 缺少 Phase2 列表采集逻辑
- 缺少 SearchGate 节流

**解决方案：直接使用 phase1-4-full-collect.mjs，不再自创流程。**
