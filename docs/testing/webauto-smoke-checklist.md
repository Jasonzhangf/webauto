# WebAuto XHS 脚本最小自测

> 仅覆盖 XHS 脚本所需的运行时能力，不含通用环境/daemon/UI 测试。

## 一键命令

```bash
node scripts/test/webauto-smoke.mjs
```

可选：`--profile xhs-qa-1`（默认 xhs-qa-1）

## 覆盖范围

单一流水线，4 个阶段按顺序检查：

### Phase 0 — Environment & Dependencies
- Node 版本（>=20）
- @web-auto/camo 版本 + engine 兼容性 + bin 文件存在
- webauto 版本
- 关键运行时 deps（ajv / iconv-lite / minimist）
- camo-runtime vendor 目录存在
- XHS action provider 文件存在（dom-ops / comments-ops / harvest-ops / detail-flow-ops / diagnostic-utils）

### Phase 1 — Camo Runtime Connectivity
- `:7704/health`
- `evaluate` 命令
- `screenshot` 命令
- `mouse:click` 命令
- `keyboard:press` 命令

### Phase 2 — XHS Module Load
- 动态 import 6 个核心 XHS 模块（无报错即通过）

### Phase 3 — XHS Page Context & Selectors
- 当前是否在 xiaohongshu 域
- feed/detail 页面上下文
- `.comment-item` / `.like-wrapper` / `.like-lottie`
- like-target 检测（`.like-wrapper > .like-lottie`）
- liked 状态读取

## 判定规则

- `FAIL=0` 即通过
- `SKIP` 允许存在（例如当前页面无评论、非 xhs 页面）
- Phase 1 失败时 Phase 3 自动 skip
