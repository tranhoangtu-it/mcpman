# mcpman Deployment Guide

**Version:** 1.0.0
**Last Updated:** 2026-02-28

## Prerequisites

- Node.js ≥20
- npm account with publish rights to `mcpman` package
- GitHub repository access (for CI/CD)
- Granular npm access token with 2FA bypass (for automated publish)

## Local Development

```bash
git clone https://github.com/tranhoangtu-it/mcpman
npm install
npm run build        # outputs dist/index.cjs, index.mjs, index.d.ts
npm run test:run     # run all 457 tests once
npm run lint:fix     # biome format + lint auto-fix
```

**Test the CLI locally before publishing:**
```bash
node dist/index.cjs --help
node dist/index.cjs install @modelcontextprotocol/server-filesystem --dry-run
```

## Version Bump Checklist

Version must be bumped in **two places** — they must always match:

1. `package.json` → `"version": "X.Y.Z"`
2. `src/utils/constants.ts` → `export const APP_VERSION = "X.Y.Z";`

```bash
# Verify both match before tagging
grep '"version"' package.json
grep 'APP_VERSION' src/utils/constants.ts
```

## CI/CD Workflows

Two GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — Continuous Integration

Triggers on every push and pull request.

```
Steps:
  1. Checkout code
  2. Setup Node.js 20 and 22 (matrix)
  3. npm install
  4. npm run lint
  5. npm run test:run
```

All PRs must pass CI before merge. Zero tolerance for failing tests.

### `publish.yml` — npm Publish

Triggers on git tag matching `v*` (e.g. `v1.0.0`).

```
Steps:
  1. Checkout code
  2. Setup Node.js 20
  3. npm install
  4. npm run build
  5. npm publish
```

Requires `NPM_TOKEN` secret in GitHub repository settings — use a granular access token with 2FA bypass enabled.

## Release Process

```bash
# 1. Ensure main branch is clean and tests pass
git checkout main
npm run test:run
npm run lint

# 2. Bump version in both files
#    package.json: "version": "1.0.0"
#    src/utils/constants.ts: APP_VERSION = "1.0.0"

# 3. Commit the version bump
git add package.json src/utils/constants.ts
git commit -m "chore: bump version to 1.0.0"

# 4. Tag the release (triggers publish.yml)
git tag v1.0.0
git push origin main --tags
```

CI/CD will automatically build and publish to npm on tag push.

## GitHub Releases

After the npm publish workflow succeeds, create a GitHub Release:

1. Go to https://github.com/tranhoangtu-it/mcpman/releases/new
2. Select the tag (e.g. `v1.0.0`)
3. Title: `v1.0.0 — <brief summary>`
4. Body: paste the relevant section from `docs/project-changelog.md`
5. Publish release

## npm Token Setup

For automated publishing (bypasses 2FA):

1. Go to https://www.npmjs.com/settings/tokens
2. Create **Granular Access Token**
3. Scope: `mcpman` package, **Read and Write** publish access
4. Enable "Bypass 2FA for this token"
5. Add as `NPM_TOKEN` secret in GitHub repository Settings → Secrets

## Verifying a Release

After publish completes:

```bash
# Verify npm has the new version
npm view mcpman version

# Install fresh and test
npx mcpman@latest --version
npx mcpman@latest --help
```

## Rollback

If a broken release is published:

```bash
# Deprecate the broken version
npm deprecate mcpman@1.0.0 "Critical bug — use 0.9.0"

# Users on deprecated version will see warning on next run
# Republish fixed version as 1.0.1
```

Do not `npm unpublish` — it breaks users who have that version pinned.

## Environment Variables for CI

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | Granular token for automated npm publish |

No other secrets required. Tests use mock data and do not call live APIs.
