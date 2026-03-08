# camo bring-to-front 策略正式化（2026-03-06）

## 目标
把之前的实验开关收敛为正式策略，并验证：
- camo 自身测试通过
- webauto 可通过正式策略名联调 camo
- detail 所需核心操作不再依赖强前台焦点

## 正式策略
- 正式变量：`CAMO_BRING_TO_FRONT_MODE=never`
- 兼容别名：`CAMO_SKIP_BRING_TO_FRONT=1`

语义：
- `auto`：默认行为，保留 bringToFront
- `never`：禁用 input/page lifecycle 中的 bringToFront

## camo 侧改动
仓库：`/Volumes/extension/code/camo`

涉及位置：
- `src/services/browser-service/internal/browser-session/utils.js`
  - 新增 `resolveBringToFrontMode()`
  - `shouldSkipBringToFront()` 改为从正式策略解析
- `src/services/browser-service/internal/browser-session/input-pipeline.js`
  - 输入 ready / recovery 支持策略化跳过 bringToFront
- `src/services/browser-service/internal/browser-session/page-management.js`
  - `newPage`
  - `switchPage`
  - `closePage` 的 next-page activation
  支持策略化跳过 bringToFront
- `src/services/browser-service/internal/BrowserSession.input.test.js`
  - 补齐 `CAMO_BRING_TO_FRONT_MODE=never` 的测试
- `src/utils/help.mjs`
- `README.md`

## camo 测试结果
命令：
- `cd /Volumes/extension/code/camo && npm test -- --runInBand tests/unit/commands/browser.test.mjs src/services/browser-service/internal/BrowserSession.input.test.js`

结果：
- `pass 271`
- `fail 0`

## webauto 侧接入
仓库：`/Users/fanzhang/Documents/github/webauto`

改动：
- `apps/webauto/entry/lib/camo-env.mjs`
  - 透传 `WEBAUTO_BRING_TO_FRONT_MODE -> CAMO_BRING_TO_FRONT_MODE`

## webauto 联调验证
命令：
- `CAMO_BRING_TO_FRONT_MODE=never node - <<'NODE' ... ensureSessionInitialized('xhs-qa-1', { url: <safe-url>, restartSession: true }) ... NODE`

结果：
- `stop` ok
- `start` ok
- `goto` ok
- `windowInit` ok

说明：
- webauto 已可通过正式策略名驱动 camo 完成 session init

## 结论
这条路径已经从“实验”进入“正式可接入”状态：
- camo 已支持正式 bring-to-front 策略
- detail 所需 `start/goto/new-page/switch-page/click/scroll` 已有实测证据
- webauto 已可通过正式变量名联调
