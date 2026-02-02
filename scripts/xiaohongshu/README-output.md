# 小红书相应目录规范（输出规范）

本文件用于明确“相应目录”（采集结果输出目录）的结构与规则。

## 相应目录

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
```

其中：
- `env`：debug / prod
- `keyword`：搜索关键字

## 必备文件/目录

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── phase2-links.jsonl          # Phase2 采集的安全链接列表（含 xsec_token）
├── .collect-state.json         # 状态文件（断点恢复与统计）
├── run.log                     # 运行日志
└── {noteId}/                   # 每条笔记一个子目录
    ├── README.md               # 详情内容（标题、正文、作者）
    ├── images/                 # 原始图片（{index}.{ext}）
    └── comments.md             # 评论列表（Markdown）
```

## 规则

1. **所有输出必须落在相应目录**，禁止写入仓库临时文件作为最终输出。
2. `phase2-links.jsonl` 必须是**安全链接**（含 `xsec_token`），禁止 href 拼接。
3. `README.md` 中的图片引用必须与 `images/` 中实际文件数量一致。
4. `comments.md` 仅包含可见评论，禁止离屏元素强制采集。
5. 断点恢复与统计统一以 `.collect-state.json` 为真源。

## 适用脚本

- `scripts/xiaohongshu/collect-content.mjs`
- `scripts/xiaohongshu/phase2-collect.mjs`
- `scripts/xiaohongshu/phase4-harvest.mjs`
