# XHS Orchestrator V2

基于 camo container subscription 的事件驱动编排方案。

## 核心变化

| V1 (旧方案) | V2 (新方案) |
|------------|------------|
| `containers:match` 轮询 | `camo container watch` 订阅 |
| 主动检测 checkpoint | 被动接收元素变更通知 |
| 全量 DOM 扫描 | filter 后仅关注订阅元素 |
| 页面状态推断 | 元素出现/消失直接驱动状态机 |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                     camo (浏览器层)                      │
├─────────────────────────────────────────────────────────┤
│  DOM Tree ──► ElementFilter ──► ChangeNotifier         │
│                                      │                  │
│                                      ▼ 轮询/WebSocket   │
│                              推送变更事件                │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
              xhs-orchestrator-v2 (编排层)                │
├─────────────────────────────────────────────────────────┤
│  CheckpointSubscriber                                   │
│    ├── watch('.search-input')      → home_ready        │
│    ├── watch('.search-bar')        → search_ready      │
│    ├── watch('.note-detail-modal') → detail_ready      │
│    └── watch('.comment-section')   → comments_ready    │
│                                                         │
│  XhsOrchestratorV2                                      │
│    └── 状态就绪后触发对应 block                         │
└─────────────────────────────────────────────────────────┘
```

## 使用方式

```typescript
import { runOrchestratorV2 } from './modules/xiaohongshu/xhs-orchestrator-v2/index.js';

const result = await runOrchestratorV2({
  keyword: '关键词',
  target: 100,
  profileId: 'xiaohongshu-batch-1',
  onCheckpoint: (event) => {
    console.log(`Checkpoint: ${event.from} -> ${event.to}`);
  },
});
```

## camo CLI 命令

```bash
# 查看可见元素
camo container list --profile xiaohongshu-batch-1

# 过滤特定元素
camo container filter ".search-input" --profile xiaohongshu-batch-1

# 订阅元素变化
camo container watch --selector ".note-detail-modal" --profile xiaohongshu-batch-1
```

## 状态机

```
unknown ──► home_ready ──► search_ready ──► detail_ready ──► comments_ready
                │               │                │
                ▼               ▼                ▼
           login_guard     login_guard     login_guard
                │               │                │
                ▼               ▼                ▼
           risk_control    risk_control    risk_control
```

## 迁移计划

1. ✅ 创建 V2 编排器骨架
2. [ ] 完善 camo 客户端库
3. [ ] 实现 WebSocket 推送（替代轮询）
4. [ ] 对接现有 blocks
5. [ ] 端到端测试
6. [ ] 移除 V1 代码

## 文件结构

```
modules/xiaohongshu/xhs-orchestrator-v2/
├── index.ts                 # 编排器入口
├── checkpoint-subscriber.ts # checkpoint 订阅管理
└── README.md               # 本文档

/Volumes/extension/code/camo/src/
├── container/
│   ├── element-filter.mjs   # 可见性过滤
│   ├── change-notifier.mjs  # 变更通知
│   └── index.mjs
├── lib/
│   └── client.mjs           # CamoContainerClient
└── commands/
    └── container.mjs        # CLI 命令
```
