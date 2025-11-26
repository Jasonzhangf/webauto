Containers v2 — Engine and Workflow Design

Overview
- Goal: strengthen the container engine with a standard, class-based DOM search, parent-child registration, automatic discovery from root, deterministic execution order, focus highlighting, feedback to parent, and incremental loading (scroll/click-next).
- Scope split:
  - Container (砖块): locating and operations only; no orchestration.
  - Workflow: orchestration only; uses container operations to drive the flow.

Module Layout
- libs/containers/src/engine
  - types.ts: core types (SelectorByClass, OperationDef, ContainerDefV2, Graph, RunMode, etc.).
  - RootDetector.ts: detect root by anchors or selectors.
  - TreeDiscoveryEngine.ts: BFS one-level child discovery by classes; stores visibility and bbox.
  - OperationQueue.ts: default operation queue (find-child as default), simple scheduler.
  - RuntimeController.ts: runs a root context, manages focus, executes ops sequentially/parallel.
  - PageLifecycle.ts: entry/wrapper for page-level run (placeholder for future policies).
  - WorkflowOverlay.ts: per-workflow override for runMode/operations.
- services/engines/container-engine/server.ts
  - /v1/containers/context/*: create context, start runtime, inspect graph/focus.
  - /v1/debug/*: picker install/toggle, highlight test, library save/list/tree.
  - devtools static: /devtools (WIP).
- local-dev/element-picker.js
  - On-page overlay: always shows sessionId with copy; provides “容器树” and picking/highlight tools for development.

Discovery and Execution Flow
1) On page visit, RootDetector checks root container selectors/anchors (class-based by default). If found, runtime starts.
2) Runtime builds an initial graph using TreeDiscoveryEngine.discoverFromRoot(rootId, rootHandle). It seeds children (one instance per def).
3) Default operation: find-child — queue per container is `[{type:'find-child'}]` if not specified. OperationQueue drives execution.
4) Focus is the running container. Runtime marks focus green-highlight (via Browser API). Parent gets feedback on child hit/fail.
5) For incremental lists, pagination config supports scroll/click-next; when child discovery hits boundary, runtime enqueues next-step ops (scroll/click) and repeats child discovery.
6) RunMode
   - sequential: parent executes children one-by-one (default).
   - parallel: sibling containers may run concurrently (cap by scheduler).

Selectors & Operations
- SelectorByClass: `classes: string[]` only; no XPath. For 1688 avatar, we handle `.userAvatarLogo` as class; the visual green highlight for `div:nth-child(2)` is only used during anchor checks/highlight.
- Operations: `find-child`, `click`, `scroll`, `type`, `waitFor`, `custom`.
- Queue: operations can be appended by parent or pagination logic and run in order.

Anchors Policy (1688)
- Captcha/风控 anchor: `.nc-lang-cnt` or `[data-nc-lang]` … If detected, we DO NOT inject the full dev menu; we only show the lightweight SID panel.
- Login-success anchor: host endsWith `1688.com` AND `.userAvatarLogo > div:nth-child(2)` visible.
- Injection: after login-success AND captcha cleared for >2 seconds → inject dev overlay and container library.
- Highlights: captcha → red; login-success anchor → green. Both are visible even before full menu injection (service highlight path bypasses login guard).

Persistent SID Panel
- Implemented by API gateway as addInitScript. It always shows top-right SID on every navigation, including captcha pages.
- File: services/legacy/controllers/sessionLaunchController.ts

Debugging and Logs
- utils/scripts/service/dev-all.mjs writes detailed logs to `debug/dev-all-YYYY-MM-DDTHH-mm-ss-sssZ.log` (anchor hits, highlight attempts, injection).
- Manual tools:
  - `npm run dev:highlight -- --sid=<sid> --type=captcha|login`
  - `npm run dev:show-sid -- --sid=<sid>`

1688 Home — Sample Containers
- Files under `libs/containers/staging/1688.com/containers`:
  - 1688-home-root.json: root (children: header, avatar, search)
  - 1688-home-header.json: top nav area
  - 1688-home-avatar.json: avatar area (login-success visual anchor)
  - 1688-home-search.json: search box area
- Container Engine dev endpoints:
  - GET `/v1/debug/library/roots?site=1688.com`
  - GET `/v1/debug/library/tree?site=1688.com&rootId=...`
  - GET `/v1/debug/library/container/:id?site=1688.com`

Dev Overlay
- Always shows sessionID with “复制SID”。
- “容器树” reads from `window.__webautoContainerLibrary[site]` injected by dev-all.
- Click node → local highlight of selector’s class matches.
- Picking mode: hover → blue highlight; click → capture element’s class selector to preview.
- API 地址：默认回落到 `http://127.0.0.1:8888`，也可通过 `window.__webautoApiBase`、`window.__WEB_AUTO_API_BASE` 或 `<meta name="webauto-api-base">` 自定义后端地址，方便在远程/容器环境中调试。

How to Run (Local)
- Launch everything and navigate:
  - `OPEN_URL="https://www.1688.com/" npm run dev:all`
  - Watch `debug/dev-all-*.log` for anchor/hook logs.
- Manual anchors highlight:
  - `npm run dev:highlight -- --sid=<sessionId> --type=captcha`
  - `npm run dev:highlight -- --sid=<sessionId> --type=login`
- Force re-install SID panel:
  - `npm run dev:show-sid -- --sid=<sessionId>`

Notes
- We do not revert any previous behavior. We add persistence for SID and make highlight robust with a fallback eval overlay.
- The overlay menu injects after anchors are satisfied to reduce risk; captcha presence suppresses injection until cleared.
