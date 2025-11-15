# Containers Library

Two-stage container libraries to manage quality and lifecycle:

- approved/: Production-grade, approved container definitions (验证库)。
- staging/: Candidate area for newly created or updated containers pending validation (测试/候选库)。

## Directory Layout

```
containers/
  approved/
    <site>/
      index.json                 # approved index (curated)
      interactive-elements/
        buttons/ …               # single-element interactive definitions
        links/ …
        inputs/ …
      containers/
        <category>/ …            # page-/feed-/post-/comment-/general-
      indicators/
        loaders/ …
  staging/
    <site>/
      index.json                 # staging index (auto-updated)
      (same sub-structure as approved)
```

- Mirrors the structure of `container-system/platforms/<site>/` to ease migration.
- New containers are saved under `containers/staging/<site>/…`.
- After review/validation, promote to `containers/approved/<site>/…` and update the approved index.

## Naming & Versioning
- File name: `<nameSlug>_<selectorHash>_<typeSuffix>.json` (e.g., `expand_button_2da4e3ec_button.json`).
- Keep `id` stable across selector updates; when selector changes significantly, create a new file and mark replacement via `metadata.replacedBy` in the old file and update `index.json`.
- Maintain `metadata.fileVersion` and timestamps.

## Index Rules
- `index.json` includes:
  - `website`, `generatedAt`, `containerCount`
  - `containers[]`: `{ id, fileName, selector }`
  - `searchIndex` (byType/byPriority/byName)
  - optional `relationships` graph

## Validation Workflow
- New → staging:
  1) Picker creates Executable Container Definition → file saved to `containers/staging/<site>/…`
  2) Update `containers/staging/<site>/index.json`
  3) Run validation workflow (Playwright + runtime checks)
- Promote → approved:
  1) Copy file to `containers/approved/<site>/…`
  2) Update `containers/approved/<site>/index.json`
  3) Optionally deprecate older versions in approved index

## Migration from existing library
- Source: `container-system/platforms/<site>/`
- Target: `containers/staging/<site>/`
- Steps:
  1) Copy directory tree keeping structure
  2) Normalize file naming to naming rules (optional pass)
  3) Regenerate `containers/staging/<site>/index.json`
  4) Validate and then promote curated subset to `containers/approved/<site>/`

## Tooling
- Loader prefers approved, then staging, then legacy path.
- Save defaults to `containers/staging/<site>/…`.

## v2 Engine (Design-in-progress)

Directory structure for the new container engine (focused on discovery tree, parent-child registration, operations, focus, and feedback):

```
libs/containers/
  src/
    engine/
      types.ts                 # core TS types for v2 engine
      TreeDiscoveryEngine.ts   # BFS, scoped discovery from root, class-based selectors
      RelationshipRegistry.ts  # parent/child + dependsOn edges registration
      OperationQueue.ts        # default ops (find-child), queue state, simple scheduler
      FocusManager.ts          # current focus container for sequential mode + highlight hint
      ExecutionPlanner.ts      # topological plan based on graph + runMode
      RuntimeController.ts     # orchestrates discovery -> execution -> incremental loading
  schema/
    container.v2.schema.json  # definition schema for v2
    index.v2.schema.json      # index schema (site-level)
```

Key v2 behaviors:
- Root-first discovery (BFS) with scoped DOM search; class selectors only, no XPath.
- Default operation is `find-child`; if a child has no `operations`, only record info.
- Operations are queued and executed in defined order; support sequential and parallel modes.
- Focus container equals the currently executing container in sequential mode; default highlight is the first operation，且高亮为绿色（执行中），非阻塞。
- Parent receives feedback when child hit/fails or boundary reached.
- Incremental loading flows for paginated content (scroll/click next until boundary).

See docs: `docs/architecture/CONTAINER_ENGINE_V2_DESIGN.md` for detailed design and flow charts.
