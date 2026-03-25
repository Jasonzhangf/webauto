# WebAuto 最小基础功能一键自测

> 只保留**单一最小自测**，已移除其他分层测试要求。

## 一键命令

```bash
node scripts/test/webauto-smoke.mjs
```

可选参数：

```bash
node scripts/test/webauto-smoke.mjs --profile xhs-qa-1
```

## 覆盖范围（固定）

脚本固定按顺序执行 4 组最小能力：

1. `env` 运行环境
   - Node/平台
   - `~/.webauto` 路径
   - `bin/webauto.mjs`
   - 核心模块可加载（dom-ops/comments-ops/harvest-ops/diagnostic-utils）

2. `camo` 运行时
   - `:7704/health`
   - `evaluate` 可执行
   - `screenshot` 可执行
   - `mouse:click` / `keyboard:press`

3. `browser` 基础交互
   - `location`
   - DOM body
   - viewport

4. `xhs` 最小业务能力
   - 当前是否在 xiaohongshu 域
   - feed/detail 页面上下文
   - `.comment-item` / `.like-wrapper` / `.like-lottie`
   - like-target 检测（`.like-wrapper > .like-lottie`）
   - liked 状态读取

## 判定规则

- `FAIL=0` 即通过
- `SKIP` 允许存在（例如当前页面无评论）

## 最新执行记录

- 时间戳（用户提供）：
  - `timeRef=now`
  - `utc=2026-03-25T03:22:16.350Z`
  - `local=2026-03-25 11:22:16.350 +08:00`
  - `tz=Asia/Shanghai`
  - `nowMs=1774408936350`
  - `ntpOffsetMs=22`

