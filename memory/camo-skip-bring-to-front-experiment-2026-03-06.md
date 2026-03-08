# camo 协议级输入无前台聚焦实验（2026-03-06）

## 目标
验证 camo 的协议级 click / scroll / switch-page 是否可以在不执行 `page.bringToFront()` 的前提下，仍正确完成 XHS detail 所需操作。

## 实验改动
在 `camo` 本地包（`/Volumes/extension/code/camo`）加入实验开关：
- env: `CAMO_SKIP_BRING_TO_FRONT=1`
- 文件：
  - `src/services/browser-service/internal/browser-session/utils.js`
  - `src/services/browser-service/internal/browser-session/input-pipeline.js`

作用：
- 跳过输入前的 `bringToFront`
- 跳过输入恢复时的 `bringToFront`
- 仅保留 settle / runtime 恢复

注意：
- 这次只绕过了“输入链路” bringToFront
- `newPage` / `switchPage` / 某些 ws 生命周期路径里仍有显式 `bringToFront`

## 验证数据源
- profile: `xhs-qa-1`
- safe detail url:
  `https://www.xiaohongshu.com/search_result/6997df4d00000000150207fd?xsec_token=ABSvUgwWKJ_dX9AvSM4ChDTpCwAVbFIVpcahTaMwG-AMU=&xsec_source=`

## 验证结果

### 1. start --url
命令：
- `CAMO_SKIP_BRING_TO_FRONT=1 camo start xhs-qa-1 --url '<safe-url>'`

结果：
- 有过一次 `page.goto` 超时样本
- 该问题更像 `start --url` 时序边界，不足以否定无前台聚焦方向

说明：
- `start --url` 仍要单独做稳定性治理
- 但不影响对 input/page lifecycle 去前台聚焦的主结论

### 2. start + goto + detail click/scroll
命令：
- `CAMO_SKIP_BRING_TO_FRONT=1 camo start xhs-qa-1`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo goto xhs-qa-1 '<safe-url>'`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo click xhs-qa-1 '.chat-wrapper' --highlight`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo click xhs-qa-1 '.total' --highlight`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo scroll xhs-qa-1 --selector '.comments-container, .comment-list, .comments-el, .note-scroller' --down --amount 220 --highlight`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo devtools eval xhs-qa-1 '...'`

结果：
- click 成功
- scroll 成功
- `.note-scroller.scrollTop` 从 0 增加到 498
- detail 评论页操作完成，未依赖 bringToFront

说明：
- 协议级输入链路本身，在已有正确 page 上，确实可以不抢前台焦点

### 3. new-page / switch-page
第一次样本：
- `CAMO_SKIP_BRING_TO_FRONT=1 camo new-page xhs-qa-1 --url 'about:blank'`
- 结果：tab 被创建，但 CLI 对 `about:blank` 做了错误 scheme 处理，报 `https://about:blank` invalid url

第二次样本（修正为不带 url）：
- `CAMO_SKIP_BRING_TO_FRONT=1 camo new-page xhs-qa-1`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo list-pages xhs-qa-1`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo switch-page xhs-qa-1 0`
- `CAMO_SKIP_BRING_TO_FRONT=1 camo click xhs-qa-1 '.chat-wrapper' --highlight`

结果：
- `new-page` 成功，新页 `index = 1`, `url = about:blank`
- `list-pages` 证明已有 2 个 tab
- `switch-page 0` 成功切回 detail 页
- 切回后 click 成功，`devtools eval` 证明仍在目标 detail 页面

说明：
- `new-page` 与 `switch-page` 已完成无前台聚焦验证
- `about:blank` 的问题属于 CLI URL 规整边界，不属于 bringToFront 依赖

## 结论
可以走这个方向，而且在本次实验中，`start / new-page / switch-page / click / scroll` 都已经完成了无前台聚焦验证。

1. 已验证可无焦点的部分：
- start（先 `camo start xhs-qa-1`，再 `goto` safe detail）
- goto
- new-page
- switch-page
- click
- scroll
- 输入恢复链路

2. 当前仍需单独评估但未本次覆盖完整行为闭环的部分：
- close-page 后激活 next page
- 某些 ws/runtime lifecycle 操作（如 dom picker 等）
- start --url 直带目标 url 的稳定性边界

3. 最合理的工程方向：
- 把 `bringToFront` 拆成显式策略，而不是全局硬编码
- input protocol 层默认支持关闭前台聚焦
- page lifecycle 层同样支持关闭前台聚焦
- 对 `start --url` 再做单独时序稳定性验证，而不是阻塞整体方向

## 本次证据
- safe links file: `/Users/fanzhang/.webauto/download/xiaohongshu/debug/deepseek/safe-detail-urls.jsonl`
- 关键验证 note: `6997df4d00000000150207fd`
- 关键结果：`.note-scroller.scrollTop = 498`, `maxScrollTop = 1705`


## 正式化收敛（2026-03-06）
- 已将实验开关收敛为正式策略名：`CAMO_BRING_TO_FRONT_MODE=never`
- `CAMO_SKIP_BRING_TO_FRONT=1` 继续作为兼容别名
- 已覆盖到：
  - input pipeline (`ensureInputReady`, `recoverInputPipeline`)
  - page lifecycle (`newPage`, `switchPage`, `closePage` next-page activation)

### 再验证（正式策略名）
命令：
- `CAMO_BRING_TO_FRONT_MODE=never camo start xhs-qa-1`
- `CAMO_BRING_TO_FRONT_MODE=never camo goto xhs-qa-1 <safe-url>`
- `CAMO_BRING_TO_FRONT_MODE=never camo new-page xhs-qa-1`
- `CAMO_BRING_TO_FRONT_MODE=never camo switch-page xhs-qa-1 0`
- `CAMO_BRING_TO_FRONT_MODE=never camo click xhs-qa-1 ' .chat-wrapper ' --highlight`
- `CAMO_BRING_TO_FRONT_MODE=never camo scroll xhs-qa-1 --selector ' .comments-container, .comment-list, .comments-el, .note-scroller ' --down --amount 220 --highlight`

结果：
- `start` 成功
- `new-page` 成功，返回 `index: 1, url: about:blank`
- `switch-page 0` 成功
- `click` 成功
- `scroll` 成功
- `devtools eval` 结果：`.note-scroller.scrollTop = 498`, `maxScrollTop = 1705`

### 结论更新
可以正式按这个方向改造：
- camo 允许默认通过显式策略关闭 bringToFront
- 对 webauto/detail 需要的 `start/new-page/switch-page/click/scroll` 已有实测证据
- 当前剩余风险不是方向错误，而是单测体系需要同步补齐到新的策略开关
