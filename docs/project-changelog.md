# mcpman Project Changelog

**Current Version:** 0.6.0
**Last Updated:** 2026-02-28
**Format:** Semantic Versioning (MAJOR.MINOR.PATCH)

All notable changes to this project are documented here.

---

## [0.6.0] — 2026-02-28

### Added

- **`profiles` command** — Create/switch/list/delete named server configuration snapshots
  - `mcpman profiles create <name> [-d description]` — snapshot current lockfile
  - `mcpman profiles switch <name>` — apply profile to lockfile
  - `mcpman profiles list` — enumerate all profiles with metadata
  - `mcpman profiles delete <name>` — remove profile
  - Data stored in ~/.mcpman/profiles/*.json
  - Useful for dev/staging/prod environment switching

- **`upgrade` command** — Self-upgrade mcpman CLI
  - `mcpman upgrade` — check npm and install latest version
  - `mcpman upgrade --check` — check only, don't install
  - Preserves config, vault, lockfile across upgrades
  - No sudo required (uses npm install)

- **`logs` command** — Stream stdout/stderr from MCP servers (v0.6.0)
  - `mcpman logs <server>` — real-time log streaming
  - Vault secrets auto-injected into server process.env
  - Ctrl+C to stop streaming
  - Useful for debugging server issues

- **`test` command** — JSON-RPC connectivity validation
  - `mcpman test <server>` — validate specific server
  - `mcpman test --all` — test all installed servers
  - Sends JSON-RPC initialize + tools/list requests
  - Reports pass/fail, response time, discovered tools
  - Validates server responsiveness before deployment

- **`plugin-health-checker.ts`** — Plugin diagnostics module
  - Integrated into `doctor` command
  - Validates plugin registry endpoints
  - Checks plugin availability and connectivity

- **`profile-service.ts`** — Named profile management core
  - CRUD operations on ~/.mcpman/profiles/
  - Profile metadata: name, description, timestamp
  - Load/apply profiles to lockfile

- **`mcp-tester.ts`** — JSON-RPC server validation core
  - Launch server, send RPC requests
  - Parse tools/list response
  - Report response time and discovered tools

- **`getProfilesDir()` utility** — Path resolution for profiles directory
  - Returns ~/.mcpman/profiles on all platforms
  - Used by profile-service for isolation

### Fixed

- **Smithery API Integration** — Now uses correct real API endpoints
  - Before: Assumed `packages[]` response format
  - After: Uses `qualifiedName`, `useCount`, `pageSize` parameters
  - Fixes pagination and filtering with Smithery registry
  - Tested against production Smithery API

- **Plugin Health Checks** — Integrated into `doctor` command
  - Validates plugin registries are reachable
  - Provides detailed error messages if plugin registry fails
  - Prevents silent plugin failures

### Changed

- **Documentation Update** — Updated README with all v0.6 commands
  - Added profiles, upgrade, logs, test to command reference
  - Updated feature comparison table
  - All 20 commands now documented

- **Example Plugin Included** — mcpman-plugin-example package
  - Shows how to create custom registry plugins
  - Demonstrates plugin interface (name, prefix, resolve)
  - Reference implementation for plugin developers

### Technical Details

- **Command Count:** 20 subcommands (install, list, remove, doctor, secrets, sync, audit, update, upgrade, config, search, info, run, logs, test, profiles, plugin, export, import, init)
- **Test Coverage:** 325+ tests across 26 test files
- **Bundle Size:** ~140KB (cjs + mjs)
- **Node Requirement:** ≥20.0.0
- **Dependencies:** No new runtime dependencies (profiles, upgrade, logs, test use existing APIs)

### Migration from v0.5.0

- No breaking changes
- Backward compatible (all v0.5 configs/vaults work in v0.6)
- New features are opt-in (profiles, upgrade, logs, test)
- No data migration required

---

## [0.5.0] — 2026-02-28

### Added

- **`plugin` command** — npm-based plugin system for custom registries
  - `mcpman plugin add <package>` — install plugin
  - `mcpman plugin remove <package>` — uninstall plugin
  - `mcpman plugin list` — show installed plugins
  - Plugins stored in ~/.mcpman/plugins/
  - Plugin interface: { name, prefix, resolve(server, options) }

- **`export` command** — Portable JSON bundle export
  - `mcpman export [output-file]` — default: mcpman-export.json
  - `mcpman export --no-vault` — exclude encrypted vault
  - `mcpman export --no-plugins` — exclude plugin list
  - Bundle contains: config + lockfile + vault + plugins
  - Enables full config portability across machines

- **`import` command** — Restore from export bundle
  - `mcpman import <file>` — restore with prompts
  - `mcpman import <file> --dry-run` — preview without applying
  - `mcpman import <file> --yes` — skip confirmations for CI/CD
  - Validates bundle integrity before applying

- **Plugin System Integration**
  - `server-resolver.ts` — detects prefix:server syntax
  - `registry-search.ts` — includes plugin registries in --all flag
  - Plugin resolution fallback in install flow

- **Example Plugin** — mcpman-plugin-example
  - Shows custom registry implementation
  - Reference for plugin developers
  - Included in examples/ directory

### Fixed

- Plugin loader error handling (graceful degradation if plugin missing)

### Technical Details

- **Test Coverage:** 281 tests across 20 test files (+30 tests for plugin/export/import)
- **Bundle Size:** ~131KB
- **New Modules:** export-import-service.ts, plugin-loader.ts

---

## [0.4.0] — 2026-02-28

### Added

- **`config` command** — Global configuration management
  - `mcpman config set <key> <value>` — set config option
  - `mcpman config get <key>` — read config option
  - `mcpman config list` — show all config
  - `mcpman config reset` — clear all config
  - Stored in ~/.mcpman/config.json
  - Keys: defaultClient, updateCheckInterval, preferredRegistry, vaultTimeout, plugins

- **`search` command** — Registry search with pagination
  - `mcpman search <query>` — npm registry search (default)
  - `mcpman search <query> --registry smithery` — Smithery registry
  - `mcpman search <query> --limit 10` — limit results (default: 20, max: 100)
  - `mcpman search <query> --all` — include plugin registries (requires v0.5+)
  - Tabular output with package name, version, description
  - Pagination support for large result sets

- **`info` command** — Package metadata & trust score
  - `mcpman info <package>` — show package details
  - `mcpman info <package> --json` — JSON output
  - Displays: version, description, downloads, trust score
  - Shows which clients have the package installed
  - Trust score helps assess package reliability

- **`run` command** — Launch servers with vault injection
  - `mcpman run <server>` — launch server process
  - `mcpman run <server> --env KEY=value` — override env vars
  - Vault secrets auto-injected into process.env
  - Useful for development and testing

### Technical Details

- **Test Coverage:** 243 tests across 17 test files (+55 tests for config/search/info/run)
- **Bundle Size:** ~110KB
- **New Modules:** config-service.ts, registry-search.ts, package-info.ts, version-checker.ts

---

## [0.3.0] — 2026-02-28

### Added

- **Vault ↔ Installer Integration**
  - Secrets auto-load during install (pre-fill env var prompts)
  - After install, prompts user to save credentials to vault
  - Reduces manual secret entry for repeated installs

- **`sync --remove` flag** — Clean extra servers from clients
  - Removes servers in client configs not in mcpman.lock
  - Keeps clients synchronized with lockfile as source of truth
  - Useful for removing obsolete servers across all clients

- **`audit --fix` flag** — Auto-update vulnerable packages
  - Checks for newer versions of vulnerable npm packages
  - Prompts user, then applies update
  - Re-scans to verify vulnerabilities resolved
  - `audit --fix --yes` skips confirmation for CI/CD

- **`server-updater.ts`** — Shared update logic
  - Extracted common code from update.ts and audit --fix
  - Follows DRY principle
  - Handles version checking, downloading, validating

- **GitHub Actions CI/CD**
  - `ci.yml` — test on every push (Node 20, 22)
  - `publish.yml` — publish to npm on git tag
  - Automated testing + release pipeline

### Fixed

- Vault integration with installer flow
- Sync engine concurrency on multi-client writes

### Technical Details

- **Test Coverage:** 188 tests across 13 test files (+37 tests for sync/audit enhancements)
- **Bundle Size:** 94.5KB
- **Workflows:** 2 GitHub Actions (ci.yml, publish.yml)

---

## [0.2.0] — 2026-02-28

### Added

- **`secrets` command** — Encrypted vault for API keys & tokens
  - `mcpman secrets set <server> KEY=value` — store secret
  - `mcpman secrets list <server>` — show server secrets
  - `mcpman secrets remove <server> KEY` — delete secret
  - Stored in ~/.mcpman/vault.enc (AES-256-CBC encrypted)
  - PBKDF2 key derivation from password
  - Password-protected, auto-locks after timeout

- **`audit` command** — Security vulnerability scanning
  - `mcpman audit` — scan all servers for vulnerabilities
  - `mcpman audit <server>` — audit specific server
  - `mcpman audit --json` — machine-readable JSON output
  - Queries OSV (Open Source Vulnerability) API
  - Computes trust score (0–100) for each package
  - Trust factors: vuln count, download velocity, age, publish frequency, maintainer signals

- **`update` command** — Check & apply server updates
  - `mcpman update` — check all servers for updates
  - `mcpman update <server>` — check specific server
  - `mcpman update --check` — check only, don't apply
  - Prompts user before updating
  - Updates lockfile with new versions

- **Auto-Update Notifications** — Version check caching
  - 24-hour cache to avoid API spam
  - Background notifications when updates available
  - Configurable check interval via config

### Technical Details

- **Test Coverage:** 151 tests across 11 test files (+101 tests for vault/audit/update)
- **Bundle Size:** 87KB
- **New Modules:** vault-service.ts, security-scanner.ts, trust-scorer.ts, version-checker.ts, update-notifier.ts
- **External APIs:** OSV vulnerability database, npm registry metadata

---

## [0.1.0] — 2026-02-27 (Initial Release)

### Added

- **Multi-Client Server Management** — Universal MCP package manager
  - Support for Claude Desktop, Cursor, VS Code, Windsurf
  - Platform-specific config detection (macOS, Windows, Linux)

- **`install` command** — Add MCP servers to AI clients
  - Install from npm: `mcpman install @scope/package`
  - Install from GitHub: `mcpman install https://github.com/owner/repo`
  - Interactive env var prompts via @clack/prompts
  - `--client` flag to target specific client
  - `--json` output for scripting

- **`list` command** — Show installed servers
  - Displays all servers with version, runtime, source
  - Shows which clients have each server registered
  - Cross-client visibility

- **`remove` command** — Uninstall servers
  - Deregister from all clients or specific client
  - Clean lockfile entry
  - Optional vault cleanup

- **`sync` command** — Cross-client config synchronization
  - Compare lockfile to each client's config
  - Preview changes with `--dry-run`
  - Apply diffs to keep clients synchronized
  - `--source` flag to use one client as truth
  - `--yes` flag to skip confirmations

- **`doctor` command** — Health diagnostics
  - Check Node/Python/Bash runtime availability
  - Validate required environment variables
  - Test server process spawn
  - Verify JSON-RPC handshake
  - Detailed error reporting with remediation

- **`init` command** — Project initialization
  - Create project-scoped mcpman.lock
  - Enables reproducible server setups in Git

- **Lockfile** — mcpman.lock for reproducibility
  - Tracks installed servers with versions
  - Stores environment variables per server
  - Supports checksums for validation
  - Machine-readable JSON format

- **Client Handlers** — Platform-specific support
  - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
  - Cursor: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/mcp.json` (macOS)
  - VS Code: `~/Library/Application Support/Code/User/settings.json` (macOS)
  - Windsurf: `~/Library/Application Support/Windsurf/User/globalStorage/windsurf.mcpConfigJson/mcp.json` (macOS)
  - Windows + Linux paths also supported

- **Registry Resolution** — Multiple package sources
  - npm registry (default)
  - Smithery registry (MCP-specific packages)
  - GitHub URLs (direct repository cloning)
  - Source detection via package name format

### Technical Details

- **Language:** TypeScript 5.7 (strict mode)
- **Runtime:** Node.js ≥20
- **Build:** tsup (outputs CJS + ESM + types)
- **Linting:** Biome 1.9
- **Testing:** Vitest 4
- **Test Coverage:** 50 tests
- **Bundle Size:** ~50KB
- **CLI Framework:** citty
- **UI Library:** @clack/prompts
- **Color Output:** picocolors

### Key Architecture Decisions

- **Binary Format:** CommonJS (index.cjs) for npm bin field compatibility
- **Multi-Client:** Abstraction layer (base-client-handler) for extensibility
- **Registry:** Pluggable registry system (npm primary, others via plugins in v0.5+)
- **Error Handling:** Graceful degradation (skip unavailable clients, warn user)
- **Secrets:** AES-256-CBC encryption (stronger than plaintext JSON)

---

## Version Compatibility Matrix

| Version | Node | npm | Clients | Commands | Tests | Bundle |
|---------|------|-----|---------|----------|-------|--------|
| 0.1.0 | ≥20 | Latest | 4 | 7 | 50 | 50KB |
| 0.2.0 | ≥20 | Latest | 4 | 10 | 151 | 87KB |
| 0.3.0 | ≥20 | Latest | 4 | 10 | 188 | 94.5KB |
| 0.4.0 | ≥20 | Latest | 4 | 14 | 243 | 110KB |
| 0.5.0 | ≥20 | Latest | 4 | 18 | 281 | 131KB |
| 0.6.0 | ≥20 | Latest | 4 | 20 | 325+ | 140KB |

---

## Deprecation Timeline

- **v0.1–v0.6:** No deprecations (backward compatible)
- **v0.7+ (planned):** Will announce if any breaking changes needed

---

## Security Advisories

### v0.6.0 & Earlier

- **No critical vulnerabilities** reported
- Vault uses industry-standard AES-256-CBC + PBKDF2
- Regular OSV scanning via audit command
- All releases tested for common vulnerabilities

---

## Contributors

- **v0.1–v0.6:** Founder (tranhoangtu-it)
- **Community:** Contributions welcome (see CONTRIBUTING.md)

---

## Support & Issues

**Report bugs:** https://github.com/tranhoangtu-it/mcpman/issues
**Discussions:** https://github.com/tranhoangtu-it/mcpman/discussions
**npm:** https://www.npmjs.com/package/mcpman

---

## Release Notes Format

Each release follows this structure:
- **Added** — New features
- **Fixed** — Bug fixes
- **Changed** — Behavior changes (not breaking)
- **Deprecated** — Features marked for removal
- **Removed** — Removed features (breaking)
- **Security** — Vulnerability fixes

Changes are evidence-based and verified against actual code/tests.
