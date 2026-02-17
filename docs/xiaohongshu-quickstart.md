# 小红书采集快速开始（新架构）

## 1. 安装与检查

```bash
npm install
npm run build:services
node scripts/xiaohongshu/install.mjs --check
```

## 2. 登录准备（必须）

首次运行建议先在可视模式完成登录。

```bash
node scripts/xiaohongshu/phase1-boot.mjs --profile xiaohongshu-batch-1 --headless false
```

## 3. 执行全流程

### 方式 A：编排入口（推荐）

```bash
node scripts/xiaohongshu/phase-orchestrate.mjs \
  --mode phase1-phase2-unified \
  --profile xiaohongshu-batch-1 \
  --keyword "工作服定制" \
  --target 50 \
  --env debug \
  --headless false
```

### 方式 B：仅运行 unified（autoscript）

```bash
node scripts/xiaohongshu/phase-unified-harvest.mjs \
  --profile xiaohongshu-batch-1 \
  --keyword "工作服定制" \
  --max-notes 50 \
  --do-comments true \
  --do-likes true \
  --like-keywords "真敬业" \
  --headless false
```

## 4. 查看进度与状态

```bash
# 状态摘要
node scripts/xiaohongshu/state.mjs show --keyword "工作服定制" --env debug

# 状态 JSON
node scripts/xiaohongshu/state.mjs show --keyword "工作服定制" --env debug --json
```

## 5. 输出目录

```text
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── phase2-links.jsonl
├── .collect-state.json
├── run*.log / run-events*.jsonl
└── {noteId}/
    ├── README.md
    ├── comments.md
    └── images/
```

## 注意事项

- 详情页必须通过页面点击进入，禁止 URL 直跳（避免 `xsec_token` 风险）。
- 调试阶段建议 `--headless false`，便于观察容器匹配与动画时序。
- 若需要仅采集链接，可单独运行 `phase2-collect.mjs`。
