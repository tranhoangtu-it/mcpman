# mcpman Project Changelog

**Current Version:** 1.0.0
**Last Updated:** 2026-02-28
**Format:** Semantic Versioning (MAJOR.MINOR.PATCH)

---

## [1.0.0] — 2026-02-28

### Summary

Stable release. 38 CLI commands, 457 tests (45 files), 92 source files. Semantic versioning guarantee from this release forward — no breaking changes without a major version bump.

### Added

- **Stable API guarantee** — all existing commands frozen; breaking changes require v2.0
- **`validate` command** — validate lockfile/config schema integrity
- **`status` command** — aggregated server status summary across all clients
- **`replay` command** — replay install sequence from history log
- **`alias` command** — define and manage server name aliases
- **`template` command** — save/apply reusable config templates
- **`notify` command** — manage update notification preferences
- **Website** — https://mcpman.pages.dev/ deployed on Cloudflare Pages (`pages.yml` workflow)

### Technical Details

- **Command Count:** 38 subcommands
- **Test Coverage:** 457 tests across 45 test files
- **Source Files:** 92 TypeScript files
- **Node Requirement:** ≥20.0.0
- **CI/CD Workflows:** `ci.yml`, `publish.yml`, `pages.yml`

### Migration from v0.9.0

- No breaking changes; fully backward compatible with all prior config/vault formats

---

## [0.9.0] — 2026-02-28

### Added

- **`validate`** — validate lockfile and client config schema
- **`status`** — aggregated server status across all clients
- **`replay`** — replay installs from history log
- **`alias`** — create/list/remove server name aliases
- **`template`** — save named config templates and apply to new installs
- **`notify`** — configure update notification preferences
- **New core:** `history-service.ts`, `alias-manager.ts`, `template-service.ts`, `notify-service.ts`, `status-checker.ts`

**Test Coverage:** 457 tests across 45 test files

---

## [0.8.0] — 2026-02-28

### Added

- **`env`** — inspect and override per-server environment variables
- **`bench`** — benchmark MCP server response latency and throughput
- **`diff`** — diff lockfile vs actual client configs
- **`group`** — organize servers into named groups for bulk operations
- **`pin`** — pin server to specific version, prevent auto-updates
- **`rollback`** — rollback to previous install state
- **New core:** `env-manager.ts`, `bench-service.ts`, `config-differ.ts`, `group-manager.ts`, `pin-service.ts`, `rollback-service.ts`

---

## [0.7.0] — 2026-02-28

### Added

- **`create`** — scaffold a new MCP server project with boilerplate
- **`link`** — link a local server directory into AI client configs
- **`watch`** — watch local server files, auto-reload clients on change
- **`registry`** — add/remove/list custom registries beyond npm and Smithery
- **`completions`** — generate shell completions for bash, zsh, fish
- **`why`** — explain why a server is installed and what depends on it
- **New core:** `scaffold-service.ts`, `link-service.ts`, `file-watcher-service.ts`, `registry-manager.ts`, `completion-generator.ts`, `why-service.ts`

---

## [0.6.0] — 2026-02-28

### Added

- **`profiles` command** — create/switch/list/delete named server config snapshots
- **`upgrade` command** — self-upgrade mcpman CLI via npm (no sudo required)
- **`logs` command** — stream stdout/stderr from MCP servers (vault secrets injected)
- **`test` command** — JSON-RPC initialize + tools/list validation; reports response time
- **`plugin-health-checker.ts`** — plugin diagnostics integrated into `doctor`
- **`profile-service.ts`** — named profile CRUD at ~/.mcpman/profiles/
- **`mcp-tester.ts`** — JSON-RPC validator core
- **`getProfilesDir()` utility** — cross-platform profiles path resolution

### Fixed

- **Smithery API** — now uses real endpoints: `qualifiedName`, `useCount`, `pageSize`
- **Plugin health checks** — integrated into `doctor`, validates registry reachability

### Technical Details

- **Test Coverage:** 325 tests across 26 test files
- **Bundle Size:** ~140KB

---

## [0.5.0] — 2026-02-28

- **`plugin`** — npm-based plugin system (`add/remove/list`; `~/.mcpman/plugins/`)
- **`export`** — portable JSON bundle (config + lockfile + vault + plugins)
- **`import`** — restore from bundle (`--dry-run`, `--yes`)
- Plugin prefix resolution in `server-resolver.ts` and `registry-search.ts`
- **New core:** `export-import-service.ts`, `plugin-loader.ts` — 281 tests (20 files)

---

## [0.4.0] — 2026-02-28

- **`config`** — global config CRUD at `~/.mcpman/config.json`
- **`search`** — npm/Smithery registry search with pagination
- **`info`** — package metadata, trust score, installed status
- **`run`** — launch server with vault secrets auto-injected into `process.env`
- 243 tests (17 files), ~110KB bundled

---

## [0.3.0] — 2026-02-28

- Vault installer integration (secrets pre-fill env prompts; save after install)
- `sync --remove` — clean extra servers from clients not in lockfile
- `audit --fix [--yes]` — auto-update vulnerable packages, re-scan to verify
- `server-updater.ts` — shared update logic (DRY)
- GitHub Actions CI/CD (`ci.yml` Node 20/22, `publish.yml` tag-based)
- 188 tests (13 files), 94.5KB bundled

---

## [0.2.0] — 2026-02-28

- **`secrets`** — AES-256-CBC vault with PBKDF2 key derivation
- **`audit`** — OSV vulnerability scanning + trust score (0–100)
- **`update`** — check/apply server updates, 24h notification cache
- 151 tests (11 files), 87KB bundled

---

## [0.1.0] — 2026-02-27 (Initial Release)

- Multi-client support: Claude Desktop, Cursor, VS Code, Windsurf
- `install`, `list`, `remove`, `sync`, `doctor`, `init`
- `mcpman.lock` for reproducible setups; npm/Smithery/GitHub URL resolution
- TypeScript 5.7 strict, tsup, biome 1.9, vitest 4 — 50 tests, ~50KB bundled

---

## Version Compatibility Matrix

| Version | Node | Commands | Tests | Bundle |
|---------|------|----------|-------|--------|
| 0.1.0 | ≥20 | 6 | 50 | 50KB |
| 0.2.0 | ≥20 | 9 | 151 | 87KB |
| 0.3.0 | ≥20 | 9 | 188 | 94.5KB |
| 0.4.0 | ≥20 | 13 | 243 | 110KB |
| 0.5.0 | ≥20 | 16 | 281 | 131KB |
| 0.6.0 | ≥20 | 20 | 325 | 140KB |
| 0.7.0 | ≥20 | 26 | ~370 | ~155KB |
| 0.8.0 | ≥20 | 32 | ~415 | ~170KB |
| 0.9.0 | ≥20 | 38 | 457 | ~185KB |
| 1.0.0 | ≥20 | 38 | 457 | ~185KB |

---

## Security Advisories

No critical vulnerabilities reported across all releases. Vault uses AES-256-CBC + PBKDF2. Regular OSV scanning via `audit` command.

---

**Report bugs:** https://github.com/tranhoangtu-it/mcpman/issues
**npm:** https://www.npmjs.com/package/mcpman
**Website:** https://mcpman.pages.dev/
