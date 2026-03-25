# WebAuto XHS 脚本最小自测

> 仅覆盖 XHS 脚本所需的运行时能力，不含通用环境/daemon/UI 测试。

## 一键命令

```bash
node scripts/test/webauto-smoke.mjs
```

可选：`--profile xhs-qa-1`（默认 xhs-qa-1）

## 覆盖范围

单一流水线，按顺序检查 XHS 脚本链路所需的全部能力：

1. **模块可加载**
   - dom-ops / comments-ops / harvest-ops / detail-flow-ops / diagnostic-utils / xhs-unified-options
2. **Camo 运行时连通性**
   - `:7704/health`
   - `evaluate` 可执行
   - `screenshot` 可执行
   - `mouse:click` / `keyboard:press`
3. **XHS 页面上下文**
   - 当前是否在 xiaohongshu 域
   - feed/detail 页面上下文
   - `.comment-item` / `.like-wrapper` / `.like-lottie`
   - like-target 检测（`.like-wrapper > .like-lottie`）
   - liked 状态读取

## 判定规则

- `FAIL=0` 即通过
- `SKIP` 允许存在（例如当前页面无评论）
