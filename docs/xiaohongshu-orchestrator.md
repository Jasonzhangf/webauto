# 小红书采集 Orchestrator（串联脚本版）

## 目标

- 不再维护巨型 `phase1-4-full-collect.mjs`
- 直接复用已验证可用的分阶段脚本
- 支持前台/后台执行

## 使用方式

### 前台执行

```bash
node scripts/xiaohongshu/orchestrator.mjs --keyword "雷军" --count 200 --env download
```

### 后台执行

```bash
node scripts/xiaohongshu/orchestrator.mjs --keyword "雷军" --count 200 --env download --daemon
```

后台日志默认落在：
- `~/.webauto/logs/daemon.<timestamp>.log`

## 执行流程

1. **Phase1**：`scripts/xiaohongshu/tests/phase1-session-login-with-gate.mjs`
   - 复用 `xiaohongshu_fresh` 会话
   - 确保登录锚点
   - 启动 SearchGate（如果需要）

2. **Phase2-4**：`scripts/xiaohongshu/tests/phase2-4-loop.mjs`
   - 参数：`--keyword <kw> --target <count> --env <env> --resume`
   - 负责：搜索 → 列表点击 → 详情提取 → 评论采集 → PersistXhsNoteBlock 落盘

## 输出目录

`phase2-4-loop.mjs` 落盘到：

```
~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
  content.md
  images/
  comments.md
```

## 注意事项

- 遵守 SearchGate 节流：所有搜索必须经 `WaitSearchPermitBlock`
- 严禁 URL 拼接（无 xsec_token 的链接一级违规）
- 所有动作必须基于容器锚点与可见 rect

