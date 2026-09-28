# WebAuto 容器框架 × DAGpipe 治理闭环设计

## 0. 结论先行

WebAuto 的"容器框架 + 根域隔离 + 事件驱动 + payload 分离 + computer-use 分支"架构
**大部分已存在于 main 代码**。本设计不重写已有能力，而是：

1. 把已存在的容器/事件/操作能力用 DAGpipe 静态治理图显式建模，形成
   "validate-before-execute" 闭环门禁；
2. 补齐 computer-use 分支的治理建模（main 中缺失的唯一架构分支）；
3. 引入 AppSDK 治理（`.appsdk/`）把回归门禁、验证 map、owner 漂移检测落地。

明确声明：DAGpipe 只做静态校验与拓扑映射；图执行由 PageDagRuntime
（`modules/webauto-v3/src/page-dag.mjs`）和 camo autoscript runtime 各自承担。
本计划不声称图"已执行"，只声称"拓扑已校验且映射到真实 owner"。

## 1. 现状核实（实读源码，非记忆）

### 已存在且可用的容器框架基座

- `modules/container-registry/src/index.ts`（214行）：`resolveSiteKey(url)` 按 URL
  解析根域 site key；`getContainersForSite(siteKey)` 拉回该根域全部容器。
  内置库 + 用户扩展 `~/.webauto/container-lib` 双源。**根域隔离已实现**。
- 容器库 `apps/webauto/resources/container-library/`：按根域建目录
  （`cbu`→1688.com、`xiaohongshu`→xiaohongshu.com、`default`），每根域下按页面
  层级（home/detail/search/login）组织 `container.json`，含锚点子容器。
- container schema（实测 `xiaohongshu/home/container.json`）：
  `selectors`(css/variant/score) + `operations`(highlight/find-child/scroll) +
  `children`(子容器 id) + `capabilities` + `page_patterns`。
  **"selector + operator 连接"结构已存在**。
- `modules/operations/`：`executor.ts`(209行，OperationContext 含
  page/systemInput) + `container-binding.ts`(90行，按 capability+声明校验
  operation) + 内置操作
  highlight/scroll/mouseMove/mouseClick/extract/click/find-child/type/navigate/key。
  **是可运行实现**，不是空壳。
- `modules/webauto-v3/src/event-store.mjs`：追加式 JSONL 事件存储，
  "Replays must rebuild run state without re-executing terminal operations"——
  **单一控制真源、终态幂等重放、事件驱动已实现**。
- `modules/webauto-v3/src/contracts.mjs`：guard verdict 五元组
  （allow/deny/unknown/risk_control/unavailable）、typed guard result。
  **payload 分离的 guard 契约已实现**。
- `modules/webauto-v3/src/container.mjs`：观测投影 buildObservation，
  anchors 归浏览器适配器所有。**观测与控制分离已实现**。
- `modules/webauto-v3/src/page-dag.mjs` + `camo-adapter.mjs`：配置节点 DAG
  顺序执行 + guard→op→post-anchor→post-guard；CamoAdapter 以 spawn camo CLI
  为唯一浏览器边界。**执行闭环已实现**。

### camo 侧闭环（已验证实跑）

camo 仓库 main（`65cce2a`）已含 autoscript 闭环：
`v2/shell/daemon/command_handlers.mjs:427` case 'autoscript' →
`compiled_runner.runGraph`（前置 dagpipe validate）。
本次已重启 camo daemon（旧 pid 91527 → 新 pid 91540）加载新代码，用
`camo-cc-flow.graph.json` 实跑 `camo autoscript run`：
`ok:true`，返回真实语义快照 JSON（snapshotId/url/title/viewport/tree.nodes）。
旧 daemon 进程加载旧代码是唯一阻塞，已消除。

### 真实差距（本设计要关上的）

1. computer-use 分支：main 中零命中（grep computer-use/vision/agentic 无结果）。
   用户明确要求"computer use 也是分支"，需新增治理建模。
2. 治理缺口：webauto 无 `.appsdk/`、无 dagpipe graph、无 verification map。
3. operations 模块 README 自标"状态：规划阶段"，但代码已实现——文档与现实脱节。

## 2. DAGpipe 治理闭环设计

### 图清单（6 个 SESE 图，全部 `dagpipe graph validate` PASS）

| 图 | 节点 | 映射的真实 flow | 执行 owner |
|---|---|---|---|
| weibo-detail-flow | open→extract | detail.mjs:64,70 | PageDagRuntime |
| weibo-search-flow | open→collect_pages | search.mjs:97,104 | PageDagRuntime |
| weibo-profile-flow | open→collect_posts | profile.mjs:155,162 | PageDagRuntime |
| weibo-timeline-flow | open→collect_posts | profile.mjs:216,223 | PageDagRuntime |
| weibo-producer-consumer-chain | producer→consumer | workflows.mjs:35,104 | durable artifact 链 |
| computeruse-branch | capture_screen→resolve_region→system_action | container.mjs:10, container-matcher.ts:229, executor.ts:16 | camo+operations systemInput |

### owners.json 真源

`docs/dagpipe/owners.json` 是唯一真源：每个 graph 节点 → operator → 真实代码
owner（file+line+symbol）。`tests/unit/dagpipe/test-dagpipe-graphs.test.mjs`
断言每个 symbol 真在该行——这是漂移检测，catches drift a hardcoded expectation cannot。

### 闭环语义（validate-before-execute）

- dagpipe `graph validate` 是前置静态门禁：SESE、无环、确定性波次、operator 绑定
  语法存在。
- `dagpipe` CLI 不执行业务代码（对齐 dagpipe-runtime skill："CLI 不执行，
  compile 才是权威注册表"）。
- 图执行分别由：①微博 flow 的 PageDagRuntime（配置节点 DAG + guard 链）；
  ②camo autoscript runtime（compiled_runner.runGraph）承担。
- 声明清晰：本计划不声称图"已执行"，只声称"拓扑已校验且映射到真实 owner"。

## 3. AppSDK 治理

### `.appsdk/project.json`

- module `webauto-governance`，suite_id `webauto-governance-regression`。
- regression command：`node --test tests/unit/dagpipe/test-dagpipe-graphs.test.mjs
  && for g in docs/dagpipe/*.graph.json; do dagpipe graph validate "$g"; done`。
- minimum_test_count: 6（实测 6/6 PASS）。
- input_paths 覆盖 dagpipe docs + weibo-v3 + webauto-v3 + operations +
  container-registry + camo-backend + 测试目录。
- protected_paths：`.appsdk/**`、`docs/dagpipe/**`、`container-library/**`。

### `.appsdk/maps/verification-map.json`

5 个 gate：
1. `dagpipe_graph_valid`：全部 graph 过 dagpipe validate（compile/review/freeze/promotion）。
2. `dagpipe_owner_drift`：owner symbol 在真实代码行存在（review/freeze/promotion）。
3. `container_library_root_isolation`：容器库按根域组织（实测 3 sites）。
4. `regression_report`：回归套件 ≥6 测试（freeze/promotion）。
5. `vcs_clean`：appsdk verify（freeze）。

## 4. computer-use 分支设计

computer-use 作为容器框架的一个分支，与 CSS-selector 分支并存：

- 容器类型：computer-use 容器用屏幕区域（region）而非 CSS selector。
- operator：`computeruse.resolve_region`（从观测解析区域）+
  `computeruse.system_action`（系统级鼠标 move/click）。
- 落点：`modules/operations/src/executor.ts:16` 的 `systemInput`
  （mouseMove/mouseClick）已支持系统坐标操作。
- 边界：`modules/camo-backend/src/internal/container-matcher.ts:229`
  matchContainer 负责区域解析。
- 风控：computer-use 节点全部开启 `riskCheckpoint: true`
  （对比微博 flow 为 false），因系统级操作风险更高。

治理图 `computeruse-branch.graph.json` 把这条分支建模为 SESE：
capture_screen → resolve_target_region → execute_system_action。

## 5. 验收证据

```sh
# 1) 图静态校验（必须 exit 0，已实跑）
for g in docs/dagpipe/*.graph.json; do dagpipe graph validate "$g"; done

# 2) 治理回归门禁（6 测试全过，已实跑）
node --test tests/unit/dagpipe/test-dagpipe-graphs.test.mjs

# 3) appsdk regression 命令（已实跑）
sh -c 'node --test tests/unit/dagpipe/test-dagpipe-graphs.test.mjs && \
  for g in docs/dagpipe/*.graph.json; do dagpipe graph validate "$g"; done'

# 4) camo autoscript 闭环（已实跑，daemon pid 91540）
node bin/camo.mjs autoscript run --graph <graph> --run-id <id> \
  --profile <p> --target <t> --action-json '{}'
```

## 6. 非目标

- 不改微博业务采集逻辑、不改 PageDagRuntime 语义、不改 camo 业务。
- 不声称 dagpipe graph"已执行"（graph 执行由 PageDagRuntime/camo runtime 承担）。
- 不在本计划内实现 computer-use 的运行时执行（只建模治理图；运行时落地是后续项）。
- 不触碰 main；全部改动落在 `playground/dagpipe-governance` worktree
  （branch `codex/dagpipe-governance`，base `origin/main` `f62cb165`）。

## 7. 未实现/待定边界（显式标注，不静默省略）

| 项 | 状态 | 处置 |
|---|---|---|
| computer-use 运行时执行 | 仅治理图建模 | 后续项：在 operations 注册 computeruse operator |
| operations README "规划阶段" | 文档与现实脱节 | 后续项：更新 README 反映已实现状态 |
| webauto daemon 实跑 | 当前未运行（~/.webauto/run 不存在） | 端到端验证需启动 daemon + 已登录 weibo profile |
| 真实微博端到端 | 需登录 profile | 用户授权后用 `scripts/macjev-weibo` 启动推理栈 + 真跑单 flow |
