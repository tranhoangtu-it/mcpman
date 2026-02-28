# mcpman Development Roadmap

**Current Version:** 1.0.0
**Last Updated:** 2026-02-28
**Status:** Stable Release

## Release Timeline

### v0.1.0 (2026-02-27) — MVP
**Status:** Complete

- Multi-client support (Claude Desktop, Cursor, VS Code, Windsurf)
- `install`, `list`, `remove`, `sync`, `doctor`, `init`
- 50 tests, ~50KB bundled

---

### v0.2.0 (2026-02-28) — Security & Auditability
**Status:** Complete

- `secrets` — AES-256-CBC vault, PBKDF2 key derivation
- `audit` — OSV vulnerability scanning + trust scoring (0–100)
- `update` — check/apply server updates, 24h notification cache
- 151 tests (11 files), 87KB bundled

---

### v0.3.0 (2026-02-28) — Enterprise & CI/CD
**Status:** Complete

- Vault installer integration (secrets auto-inject during install)
- `sync --remove`, `audit --fix`, `audit --fix --yes`
- `server-updater.ts` shared module (DRY)
- GitHub Actions CI/CD (Node 20, 22)
- 188 tests (13 files), 94.5KB bundled

---

### v0.4.0 (2026-02-28) — Discovery & Configuration
**Status:** Complete

- `config` — global config at ~/.mcpman/config.json
- `search` — npm/Smithery registry search with pagination
- `info` — package details, trust score, installed status
- `run` — launch servers with vault secrets auto-injected
- 243 tests (17 files), ~110KB bundled

---

### v0.5.0 (2026-02-28) — Extensibility & Portability
**Status:** Complete

- `plugin` — npm-based plugin system for custom registries
- `export` — portable JSON bundle (config + lockfile + vault + plugins)
- `import` — restore from bundle with --dry-run and --yes
- Plugin prefix resolution: `prefix:server` → plugin.resolve()
- 281 tests (20 files), ~131KB bundled

---

### v0.6.0 (2026-02-28) — Operations & Refinement
**Status:** Complete

- `profiles` — named server config snapshots
- `upgrade` — self-upgrade mcpman CLI via npm
- `logs` — stream stdout/stderr from MCP servers
- `test` — JSON-RPC initialize + tools/list validation
- `plugin-health-checker.ts` — plugin diagnostics in doctor
- Smithery API fix (qualifiedName, useCount, pageSize)
- 325 tests (26 files), ~140KB bundled

---

### v0.7.0 (2026-02-28) — Developer Tooling
**Status:** Complete

- `create` — scaffold new MCP server project
- `link` — link local server directory to clients
- `watch` — file-watch + auto-reload local servers
- `registry` — manage custom registries
- `completions` — shell completion generation (bash/zsh/fish)
- `why` — explain why a server is installed

---

### v0.8.0 (2026-02-28) — Advanced Management
**Status:** Complete

- `env` — manage per-server environment variables
- `bench` — benchmark server response performance
- `diff` — diff lockfile vs actual client configs
- `group` — organize servers into named groups
- `pin` — pin server to specific version
- `rollback` — rollback to previous install state

---

### v0.9.0 (2026-02-28) — Automation & Workflows
**Status:** Complete

- `validate` — validate lockfile/config schema
- `status` — aggregated server status summary
- `replay` — replay installs from history log
- `alias` — define server name aliases
- `template` — save/apply config templates
- `notify` — manage update notification settings

---

### v1.0.0 (2026-02-28) — Stable Release
**Status:** Current

- 38 CLI commands covering full MCP server lifecycle
- 457 tests across 45 test files
- 92 source files (stable, no breaking changes)
- Semantic versioning guarantee from this release forward
- Production-grade stability
- Website launched at https://mcpman.pages.dev/ (Cloudflare Pages)

---

## Milestone Progress (v1.0.0)

| Component | Status | Progress | Notes |
|-----------|--------|----------|-------|
| **Core Features** | Complete | 100% | All 38 commands implemented |
| **Multi-Client** | Complete | 100% | Claude, Cursor, VS Code, Windsurf |
| **Vault & Secrets** | Complete | 100% | AES-256-CBC + PBKDF2 |
| **Sync Engine** | Complete | 100% | Multi-client + --remove flag |
| **Security** | Complete | 100% | OSV + trust scoring + audit --fix |
| **Plugins** | Complete | 100% | npm-based extensibility |
| **Profiles** | Complete | 100% | Named config snapshots |
| **Dev Tooling** | Complete | 100% | create, link, watch, completions |
| **Advanced Mgmt** | Complete | 100% | bench, diff, group, pin, rollback |
| **Automation** | Complete | 100% | validate, status, replay, alias |
| **Testing** | Complete | 100% | 457 tests, 45 files |
| **CI/CD** | Complete | 100% | GitHub Actions, npm publish, pages.yml |
| **Website** | Complete | 100% | https://mcpman.pages.dev/ deployed |

---

## Post v1.0 Roadmap

### v1.1.0 — Dashboard & Monitoring
- Web dashboard (`mcpman dashboard`) for config visualization
- Real-time server health monitoring (WebSocket streaming)
- Trust score history and trends
- Plugin marketplace integration

### v1.2.0 — Team Collaboration
- Shared vault for teams (encrypted sync)
- Role-based access control (admin/maintainer/viewer)
- Audit logs (who installed/removed what)
- Team config namespaces

---

## Success Metrics (v1.0.0)

| Metric | v0.6 | v1.0 Target | v1.0 Current |
|--------|------|-------------|--------------|
| npm downloads/week | 200+ | 1,000+ | Growing |
| GitHub stars | 80+ | 500+ | Growing |
| Test coverage | 85%+ | 95%+ | 457 tests |
| CLI commands | 20 | 38 | 38 |
| Supported clients | 4 | 4 | 4 |

---

## Getting Started

```bash
git clone https://github.com/tranhoangtu-it/mcpman
npm install
npm run test:run
git checkout -b feat/my-feature
```

**Code Review Standards:**
- All PRs require passing tests + lint
- Docs updated for user-facing changes
- No breaking changes without major version bump
- Conventional commit format required
