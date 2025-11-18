# Repository Guidelines

This document guides all contributors (humans and AI agents) working in this repository.

## Project Structure & Modules

- `libs/`: Core libraries (browser, UI recognition, workflows, containers). Browser entry point: `libs/browser/browser.js`.
- `services/`: Node.js backend services (`engines/`, `api/`, `shared/`).
- `apps/`: Application layer and user-facing apps.
- `utils/scripts/`: Build, dev, and maintenance scripts.
- `docs/`: Documentation in Chinese and English.
- Tests: `test_*.py` (Python) and `test-*.js` (Node.js), plus service-specific test folders.

## Build, Test & Development

- `npm install`: Install all Node.js dependencies.
- `npm run build:services`: Build all backend services into `dist/`.
- `npm run dev:all`: Start all core services in development mode.
- `npm start`: Start the main application entry.
- Tests:
  - `npm run test:services`, `npm run test:vision`, `npm run test:simple`, `npm run test:camoufox`.
  - Python: `python test_browser_module.py`, `python test_camoufox.py`, `python test_cookie_integration.py`.

## Coding Style & Naming

- JavaScript/TypeScript: ES2022, modules (`import`/`export`), prefer async/await. Follow existing files; default to 2-space indentation.
- Python: PEP 8, type hints where useful, 4-space indentation.
- Tests: `test_*.py` and `test-*.js` naming. Keep feature-specific tests near related modules.
- Do not import Playwright, Camoufox, or Selenium directly; always use `browser_interface.py` (Python) or `libs/browser/browser.js` (Node.js).

## Testing Guidelines

- Add or update tests for all non-trivial changes.
- Keep tests deterministic; use mock data where possible.
- Run relevant `npm run test:*` and Python tests before opening a PR.

## Commit & Pull Request Guidelines

- Commits: Prefer conventional prefixes (e.g., `feat(scope): msg`, `fix(scope): msg`, `chore(scope): msg`).
- PRs: Provide a clear summary, list of changes, test commands run, and any related issues. Include screenshots or logs for UI/automation changes when helpful.
- Keep PRs focused and small; split large changes into logical pieces.

## Architecture & Security Notes

- All browser operations must go through the unified entry points: `libs/browser/browser.js` and `browser_interface.py`.
- Do not bypass security layers (`abstract-browser`, `security/enforce-imports.js`).
- Avoid hardcoded credentials or secrets; use configuration and environment variables.

