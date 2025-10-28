# Repository Guidelines

## Project Structure & Module Organization
- `sharedmodule/operations-framework/` — Core detectors and event bus.
- `sharedmodule/openai-compatible-providers/` — OpenAI‑compatible model adapters.
- `node-system/` — Visual workflow engine (ComfyUI‑style).
- `workflows/` — Workflows (Weibo + 1688), plus `preflows/`, `records/`, `sequences/`.
- `src/` — Main TypeScript sources.
- `dist/` — Compiled JavaScript output.
- `test-data/` — Sample data for testing.
- `config/` — Configuration JSON files.

## Build, Test, and Development Commands
- `npm run install:all` — Install dependencies across all modules.
- `npm run build:all` — Build every package in the repo.
- `npm run build:ts:watch` — TypeScript build with watch for dev.
- `npm run test:all` — Run all unit/integration tests.
- `npm run test:login-detector`, `npm run test:cookie-manager` — Targeted test examples.
- `npm run start:mcp`, `npm run start:weibo` — Start services locally; see logs for output.
- `npm run clean` — Remove build artifacts.
Manual runners:
- `node scripts/run-workflow.js <workflow.json>` — Run a single workflow.
- `node workflows/SequenceRunner.js <sequence.json>` — Run multiple workflows in sequence with in‑process session handoff.

## Coding Style & Naming Conventions
- Language: TypeScript targeting ES2022; ESNext modules; 2‑space indent.
- Files: kebab‑case (e.g., `weibo-login-detector.ts`). Classes: PascalCase. Methods: camelCase.
- Events: PascalCase with clear suffix (e.g., `LoginDetectedEvent`). Config: kebab‑case JSON.
- Prefer event mechanisms over direct calls; encapsulate logic in container classes.

## Testing Guidelines
- Framework: Jest for unit tests; custom integration suites.
- Naming: `*.test.js` or `*.spec.js`; co‑locate with modules or dedicated files.
- Integration: follow `comprehensive-test-suite.js` style for complex workflows.
- Run via `npm run test:all` or the targeted scripts above.

## Commit & Pull Request Guidelines
- Commits: Conventional commits in Chinese (`feat:`, `fix:`, `refactor:`…).
- Branches: descriptive feature branches; keep scope focused.
- PRs: include change summary, testing performed, and any breaking changes.
- CI gates: TypeScript builds must pass; tests must succeed; update docs when architecture changes.

## Agent‑Specific Instructions
- Use event‑driven orchestration; avoid tight coupling across modules.
- Expose functionality via container classes with event interfaces.
- Make behavior configuration‑driven using files under `config/`.
- Maintain strict types for events and data structures; isolate errors.
- For workflows, prefer preflows for environment/login prep and write handshake records to `workflows/records/`.
  - Login preflow: `workflows/preflows/1688-login-preflow.json` (cookie-first; if cookie invalid → manual login polling → resave cookies; success/failure → record + End/Halt).
  - Engine retries preflows up to 3 times; on final failure, main workflow does not start.
  - Session relay (same process): EndNode persists session; next workflow can use `AttachSessionNode` with `sessionId`.

## Security & Configuration Tips
- Manage cookies through the event‑driven cookie manager.
- Use browser sandboxing and clean up resources (pages, files) deterministically.
- Validate all external inputs; apply least‑privilege for system operations.

## Workflow Execution
- Enable/disable preflows: edit `workflows/preflows/enabled.json`.
- Run with preflows: `node scripts/run-workflow.js workflows/1688/domestic/1688-homepage-workflow.json`.
- Sequence handoff (same process): `node workflows/SequenceRunner.js workflows/sequences/example-sequence.json`.
- Records: per‑run JSON saved under `workflows/records/` with basic metadata.
