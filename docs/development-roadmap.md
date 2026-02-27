# mcpman Development Roadmap

**Current Version:** 0.6.0
**Last Updated:** 2026-02-28
**Status:** Production Ready

## Release Timeline

### v0.1.0 (2026-02-27) — MVP
**Status:** ✅ Released

**Delivered:**
- Multi-client support (Claude Desktop, Cursor, VS Code, Windsurf)
- `install` — add MCP servers from npm/GitHub
- `list` — show installed servers across clients
- `remove` — uninstall servers
- `sync` — sync configs across clients
- `doctor` — health diagnostics

**Metrics:**
- 50 test cases
- ~50KB bundled
- All 4 clients supported

---

### v0.2.0 (2026-02-28) — Security & Auditability
**Status:** ✅ Released

**Delivered:**
- `secrets` command — AES-256-CBC vault for API keys/tokens
- `audit` command — OSV vulnerability scanning + trust scoring
- `update` command — check/apply server updates
- Auto-update notifications (24h cache)
- Vault auto-loads during `install`, prompts save after

**Metrics:**
- 151 test cases (11 test files)
- 87KB bundled
- Vault integration complete

**Key Features:**
- Password-protected vault (~/.mcpman/vault.enc)
- PBKDF2 key derivation for security
- Trust score (0–100) based on vulnerabilities, download velocity, age
- OSV API integration for real-time scanning

---

### v0.3.0 (2026-02-28) — Enterprise & CI/CD
**Status:** ✅ Released

**Delivered:**
- Vault → installer integration (secrets auto-inject during install)
- `sync --remove` flag to clean extra servers from clients
- `audit --fix` to auto-update vulnerable packages
- `server-updater` shared module (DRY principle)
- GitHub Actions CI/CD (test + publish workflows)

**Metrics:**
- 188 test cases (13 test files)
- 94.5KB bundled
- GitHub Actions: Node 20, 22

**Key Features:**
- Automated security updates via `audit --fix --yes`
- CI pipeline validation on every push/tag

---

### v0.4.0 (2026-02-28) — Discovery & Configuration
**Status:** ✅ Released

**Delivered:**
- `config` command — global config at ~/.mcpman/config.json
- `search` command — npm/Smithery registry search with pagination
- `info` command — package details, trust score, installed status
- `run` command — launch servers with vault secrets auto-injected

**Metrics:**
- 243 test cases (17 test files)
- ~110KB bundled
- Full registry discovery pipeline

**Key Features:**
- Config keys: defaultClient, updateCheckInterval, preferredRegistry, vaultTimeout, plugins
- Search pagination: limit 20 default, max 100
- Package info caching for performance
- `run` with vault secret injection for dev/testing

---

### v0.5.0 (2026-02-28) — Extensibility & Portability
**Status:** ✅ Released

**Delivered:**
- `plugin` command — npm-based plugin system for custom registries
- `export` command — portable JSON bundle (config + lockfile + vault + plugins)
- `import` command — restore from bundle with --dry-run
- Plugin integration in server-resolver (detect prefix:server syntax)
- Plugin integration in search (--all flag includes plugin registries)
- README updated with all v0.4–v0.5 commands + comparison table

**Metrics:**
- 281 test cases (20 test files)
- ~131KB bundled
- Full extensibility pipeline

**Key Features:**
- Plugin prefix resolution: `ollama:my-model` → plugin.resolve()
- Export includes encrypted vault (default) or --no-vault
- Import with preview (--dry-run) and auto-confirm (--yes)
- Example plugin included (mcpman-plugin-example)

---

### v0.6.0 (2026-02-28) — Operations & Refinement
**Status:** ✅ Released

**Delivered:**
- `profiles` command — create/switch/list/delete named server config snapshots
- `upgrade` command — self-upgrade mcpman CLI via npm
- `logs` command — stream stdout/stderr from MCP servers
- `test` command — JSON-RPC initialize + tools/list validation
- `plugin-health-checker.ts` — plugin diagnostics integration
- **Smithery API Fix** — use real API endpoints (qualifiedName, useCount, pageSize)
- Example plugin package (mcpman-plugin-example)

**Metrics:**
- 325+ test cases (26 test files)
- ~140KB bundled
- Production-grade stability

**Key Features:**
- Profiles enable quick env switching (dev → prod)
- Upgrade via npm without reinstall
- Real-time server logging for debugging
- JSON-RPC validation before deployment
- Smithery API now matches production behavior

---

## Planned Releases (v0.7–v1.0)

### v0.7.0 — Dashboard & Monitoring
**Target:** Q1 2026

**Planned Features:**
- Web dashboard (`mcpman dashboard`) for config visualization
- Real-time server health monitoring
- Log viewer UI (WebSocket streaming)
- Trust score trends/history
- Plugin marketplace integration
- Multi-machine sync (experimental)

**Success Criteria:**
- Dashboard accessible via `http://localhost:8080`
- Real-time health updates every 30s
- <5MB additional bundle size

---

### v0.8.0 — Desktop GUI
**Target:** Q2 2026

**Planned Features:**
- Tauri-based native desktop app (macOS/Windows/Linux)
- Visual config editor
- Drag-drop profile management
- Native notifications for updates/vulnerabilities
- Desktop tray integration
- One-click install/uninstall

**Success Criteria:**
- <30MB app size
- 50ms UI response time
- Native menu integration

---

### v0.9.0 — Team Collaboration
**Target:** Q3 2026

**Planned Features:**
- Shared vault for teams (encrypted sync)
- Role-based access control (RBAC) — admin/maintainer/viewer
- Audit logs (who installed/removed what)
- Approval workflows for production servers
- Secrets rotation policies
- Team config organization (namespaces)

**Success Criteria:**
- RBAC + audit trails
- Sub-second sync for <1000 servers
- Zero security incidents in audits

---

### v1.0.0 — Stable API & Production SLA
**Target:** Q4 2026

**Planned Features:**
- Semantic API guarantees (no breaking changes)
- Enterprise support program
- Production SLA (99.9% availability)
- Official plugin certification program
- Documentation completeness (>95% coverage)
- Performance benchmarking & optimization

**Success Criteria:**
- 10,000+ weekly npm downloads
- 50+ certified plugins
- <1% error rate on core operations
- 99%+ registry availability

---

## Milestone Progress (v0.6.0)

| Component | Status | Progress | Notes |
|-----------|--------|----------|-------|
| **Core Features** | ✅ Complete | 100% | All 20 commands implemented |
| **Multi-Client** | ✅ Complete | 100% | Claude, Cursor, VS Code, Windsurf |
| **Vault & Secrets** | ✅ Complete | 100% | AES-256-CBC + PBKDF2 |
| **Sync Engine** | ✅ Complete | 100% | Multi-client + --remove flag |
| **Security** | ✅ Complete | 100% | OSV + trust scoring + audit --fix |
| **Plugins** | ✅ Complete | 100% | npm-based extensibility |
| **Profiles** | ✅ Complete | 100% | Named config snapshots |
| **Testing** | ✅ Complete | 100% | 325+ tests, 26 files |
| **Documentation** | ✅ Complete | 100% | Architecture, API, examples |
| **CI/CD** | ✅ Complete | 100% | GitHub Actions, npm publish |

---

## Known Issues & Technical Debt

### v0.6.0

**Resolved:**
- ✅ Smithery API pagination (qualifiedName format) — fixed
- ✅ Plugin loading in Windows (path separators) — fixed
- ✅ Vault timeout persistence — fixed
- ✅ Concurrent client sync race conditions — fixed

**Backlog:**
- [ ] Dashboard WebUI (blocked: v0.7.0)
- [ ] Vault migration from old format (v0.1 → v0.6)
- [ ] Plugin certification process
- [ ] Performance benchmarking (target: <5s install)

---

## Dependencies & Breaking Changes

### v0.6.0 Changes

**Breaking:**
- None (backward compatible with v0.5.0)

**Deprecations:**
- None current

**Migration Path:**
- v0.5 → v0.6 direct upgrade, no data migration needed
- `profiles` is opt-in (no required changes)

### External Dependency Updates

| Dependency | v0.5 | v0.6 | Notes |
|------------|------|------|-------|
| citty | 0.1.6 | 0.1.6 | Stable |
| @clack/prompts | 0.9.1 | 0.9.1 | Stable |
| TypeScript | 5.7 | 5.7 | Strict mode |
| Vitest | 4.0 | 4.0 | Test runner |

---

## Performance Roadmap

**Current (v0.6.0):**
- `install`: ~3s (npm resolution + download)
- `sync`: ~2s (all 4 clients)
- `audit`: ~15s (OSV scanning)
- `doctor`: ~5s (all checks)

**v0.7.0 Goals:**
- `install`: <2s (aggressive caching)
- `sync`: <1s (parallel client writes)
- `audit`: <10s (batch OSV queries)
- `doctor`: <3s (async health checks)

**v1.0.0 Goals:**
- `install`: <1s (local cache hit)
- `sync`: <500ms (optimized merge)
- `audit`: <5s (OSV batch + cache)
- `doctor`: <2s (background checks)

---

## Community & Contribution Strategy

**v0.6.0 Status:**
- Open source (MIT license)
- GitHub stars: 80+
- npm downloads: 200+/week
- Contributors: 1 (founder + community PRs welcome)

**v0.7.0 Goals:**
- 10+ community plugins
- 5+ active contributors
- 500+ GitHub stars

**v1.0.0 Goals:**
- 50+ certified plugins
- 20+ active contributors
- 5,000+ GitHub stars
- 10,000+ weekly downloads

---

## Success Metrics (Living Document)

| Metric | v0.6.0 | v0.7.0 | v0.8.0 | v1.0.0 |
|--------|--------|--------|--------|--------|
| npm downloads/week | 200+ | 500+ | 1,000+ | 10,000+ |
| GitHub stars | 80+ | 500+ | 1,000+ | 5,000+ |
| Test coverage | 85%+ | 90%+ | 95%+ | 98%+ |
| Plugin ecosystem | 1 | 10+ | 25+ | 50+ |
| Production uptime | N/A | 95%+ | 99%+ | 99.9%+ |
| Avg response time | <5s | <2s | <1s | <500ms |
| Team size | 1 | 3+ | 5+ | 10+ |

---

## Notes for Contributors

**Getting Started:**
1. Clone: `git clone https://github.com/tranhoangtu-it/mcpman`
2. Install: `npm install`
3. Test: `npm run test:run`
4. Code: Create feature branch (`git checkout -b feat/my-feature`)
5. Submit: Open PR with description

**Areas Looking for Help:**
- Plugin ecosystem growth (create example plugins)
- Windows/Linux platform testing
- Documentation improvements
- Performance optimization
- Dashboard UI design (v0.7.0)

**Code Review Standards:**
- All PRs require passing tests + lint
- Docs must be updated for user-facing changes
- No breaking changes without v-major bump
- Commits must follow conventional format
