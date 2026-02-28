# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-02-28

### Added
- Production-ready release with 38 CLI commands
- Website landing page
- LICENSE, CONTRIBUTING.md, SECURITY.md
- Complete documentation update

### Fixed
- `package.json` module field pointing to wrong ESM path (`index.mjs` → `index.js`)
- CI/CD publish workflow missing lint/test gates before publish

---

## [0.9.0] - 2026-02-28

### Added
- `validate` — lockfile + client config schema validation
- `status` — live MCP server process probe
- `replay` — CLI command history with playback
- `alias` — command shorthand aliases
- `template` — sharable install templates
- `notify` — webhook/shell event hooks

---

## [0.8.0] - 2026-02-28

### Added
- `env` — per-server environment variable CRUD
- `bench` — latency benchmarking (p50/p95)
- `diff` — visual client config diff
- `group` — server group tags
- `pin` — version pinning
- `rollback` — auto-snapshot + restore

---

## [0.7.0] - 2026-02-28

### Added
- `create` — scaffold MCP server projects (Node + Python)
- `link` — register local servers with AI clients
- `watch` — auto-restart on file changes
- `registry` — custom registry CRUD
- `completions` — bash/zsh/fish shell completions
- `why` — server provenance query

---

## [0.6.0] - 2026-02-28

### Added
- `profiles` — named config switching
- `upgrade` — self-update CLI
- `logs` — real-time server log streaming
- `test` — JSON-RPC server validation

### Fixed
- Smithery API response parsing
- Doctor command with plugin health checks

---

## [0.5.0] - 2026-02-28

### Added
- `plugin` — npm-based custom registry plugins (~/.mcpman/plugins/)
- `export` — portable JSON bundles (config + lockfile + vault + plugins)
- `import` — restore from export bundle with `--dry-run` and `--yes` flags
- Plugin integration in server-resolver and search (`--all` flag)

---

## [0.4.0] - 2026-02-28

### Added
- `config` — global CLI configuration at `~/.mcpman/config.json`
- `search` — npm/Smithery registry search with tabular output
- `info` — package details, trust score, installed clients
- `run` — launch MCP servers with vault secrets injected into `process.env`

---

## [0.3.0] - 2026-02-28

### Added
- Vault-installer integration: auto-load secrets, offer save after install
- `sync --remove` — clean extra servers from clients
- `audit --fix` — auto-update vulnerable packages + re-scan
- Shared `server-updater.ts` extracted from `update.ts` (DRY)
- GitHub Actions CI/CD: `ci.yml` (Node 20+22) + `publish.yml` (tag-based)

---

## [0.2.0] - 2026-02-28

### Added
- `secrets` — AES-256-CBC encrypted vault with PBKDF2 key derivation
- `sync` — cross-client config sync with diff detection
- `audit` — security scanning via OSV API + trust scoring (0–100)
- `update` — version checking with 24h cached auto-notifications

---

## [0.1.0] - 2026-02-28

### Added
- `install` — MCP server installation
- `list` — list installed servers
- `remove` — uninstall servers
- `doctor` — health diagnostics
- `init` — project scaffolding
