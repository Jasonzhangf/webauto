# WebAuto CI/CD & Release Process

## CI (Pull Request / Push to `main`)

- Trigger: `.github/workflows/ci.yml`
- Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` + Node `20`
- Core gates:
  - `npm ci`
  - `npm --prefix apps/desktop-console ci`
  - `npm run test:ci`
  - `npm run coverage:ci`
  - `node scripts/check-legacy-refs.mjs`
  - `node scripts/check-untracked-sources.mjs`
  - `node scripts/check-sub-dist.mjs`
  - `npm --prefix apps/desktop-console run build` (smoke on Ubuntu)

## Release Verification

- Trigger: `.github/workflows/release.yml`
  - `release.published`
  - `workflow_dispatch` (optional publish)
- Verify job gates:
  - `npm ci`
  - `npm --prefix apps/desktop-console ci`
  - Release tag/version match check (`vX.Y.Z` == `package.json.version`) for release events
  - `npm run build:release`

## Publish to npm

- Publish job runs only when:
  - release published, or
  - workflow_dispatch with `publish=true`
- Required secret:
  - `NPM_TOKEN`
- Publish command:
  - `npm publish --access public --provenance`

## Local Release Command

- Full local release gate:
  - `npm run build:release`
- Optional flags:
  - `npm run build:release -- --skip-tests`
  - `npm run build:release -- --skip-pack`

## Notes

- `scripts/test/run-coverage.mjs` is the CI coverage entry point.
- Coverage artifacts include:
  - `coverage/`
  - `apps/desktop-console/coverage/`
