# Xiaohongshu Scripts

- `tests/`: 原子化调试脚本（Phase1 登录守护、Phase2 搜索验证等），每个能力单独验证。
- `integration/`: 工作流/集成脚本（例如完整抓取 100 条、评论深度展开等），待 Phase3 之后补全。

规则：

- 同一平台仅允许一个会话，命名为 `xiaohongshu_fresh`。任何脚本在创建会话之前必须先运行 `tests/status.mjs` 获取当前状态；若会话存在则只能复用，若不存在才运行 `tests/phase1-session-login.mjs`。
- `tests/phase1-session-login.mjs` 会以 detached headful 方式启动浏览器并等待人工登录，窗口会常驻，需手动关闭。
- `tests/phase2-search.mjs` 等脚本默认要求 Phase1 已完成并保持登录。

常用命令：

```bash
# 查看当前状态
node scripts/xiaohongshu/tests/status.mjs

# 启动/复用会话并等待登录
node scripts/xiaohongshu/tests/phase1-session-login.mjs

# 搜索页验证
node scripts/xiaohongshu/tests/phase2-search.mjs
```
