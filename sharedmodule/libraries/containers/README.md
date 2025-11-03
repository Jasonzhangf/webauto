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
