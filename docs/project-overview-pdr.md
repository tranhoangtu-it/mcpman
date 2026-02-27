# mcpman — Project Overview & PDR

**Current Version:** 0.6.0
**Release Date:** 2026-02-28
**Status:** Production (5 releases shipped, 325+ tests passing)

## Executive Summary

**mcpman** is a universal CLI package manager for Model Context Protocol (MCP) servers. It solves the fragmentation problem of managing MCP servers across multiple AI clients (Claude Desktop, Cursor, VS Code, Windsurf) by providing a single, unified interface for installation, configuration, security auditing, and lifecycle management.

**Key Differentiator:** Only tool combining multi-client support + lockfile + vault + security audit + plugin extensibility + config portability.

## Vision & Mission

**Vision:** Enable developers to manage MCP ecosystems as easily as managing npm packages.

**Mission:** Provide a production-grade, secure, extensible package manager that:
- Works across all major AI clients without vendor lock-in
- Encrypts secrets by default
- Detects security vulnerabilities before deployment
- Enables team collaboration via config portability
- Extends via npm-based plugins without reinventing package distribution

## Product Requirements

### Functional Requirements (FR)

#### FR-1: Multi-Client Server Management
- **Description:** Install, list, remove, and update MCP servers across Claude Desktop, Cursor, VS Code, and Windsurf from single CLI
- **Acceptance Criteria:**
  - `install <server>` registers server in all detected clients OR specific client via `--client`
  - `list` shows servers with version, runtime, source, client registration status
  - `remove <server>` deregisters from all clients or specific client
  - Server configs merge correctly into existing client configs without loss

#### FR-2: Cross-Client Synchronization
- **Description:** Keep server configs consistent across all clients, auto-detect drift
- **Acceptance Criteria:**
  - `sync` compares lockfile to each client config, previews differences
  - `--dry-run` shows changes without applying
  - `--source <client>` uses one client as primary source of truth
  - `--remove` cleans extra servers from clients not in lockfile
  - `--yes` skips confirmation prompts for CI/CD

#### FR-3: Security Vault for Secrets
- **Description:** Encrypt API keys/tokens using AES-256-CBC, auto-inject during server launch
- **Acceptance Criteria:**
  - `secrets set <server> KEY=value` stores in ~/.mcpman/vault.enc (PBKDF2 key derivation)
  - Vault is password-protected, locked after timeout
  - During `install`, vault secrets pre-fill env var prompts
  - During `run` and `logs`, secrets auto-injected into process.env
  - Export excludes vault by default; `--no-vault` flag for config-only export

#### FR-4: Vulnerability Scanning & Trust Scoring
- **Description:** Scan installed servers for known vulnerabilities, compute trust scores
- **Acceptance Criteria:**
  - `audit` queries OSV API for each package, returns vulnerability list
  - Trust score (0–100): accounts for vuln count, download velocity, package age, publish frequency, maintainer signals
  - `audit --json` outputs machine-readable report
  - `audit --fix` auto-updates vulnerable npm packages
  - `audit --fix --yes` skips confirmation

#### FR-5: Lockfile for Reproducibility
- **Description:** Track installed servers in mcpman.lock for CI/CD and team sharing
- **Acceptance Criteria:**
  - `init` creates mcpman.lock in current directory (project-scoped)
  - `install` and `remove` auto-update lockfile with server name, version, source, env vars
  - Lockfile can be committed to Git for reproducible team setups
  - `install` without mcpman.lock uses global ~/.mcpman/ scope

#### FR-6: Plugin System for Extensibility
- **Description:** Allow npm packages to register custom registries (e.g. Ollama, HuggingFace, internal registries)
- **Acceptance Criteria:**
  - `plugin add <npm-package>` installs plugin to ~/.mcpman/plugins
  - Plugin exports `McpmanPlugin` interface: { name, prefix, resolve(server, options) }
  - `install <prefix>:<server>` resolves via plugin's prefix
  - `search --all` includes plugin registries
  - Plugins can store config via `config` command

#### FR-7: Configuration Portability
- **Description:** Export/import full mcpman state (config + lockfile + vault + plugins) as JSON bundle
- **Acceptance Criteria:**
  - `export` saves to mcpman-export.json (includes all state)
  - `export --no-vault` excludes encrypted vault
  - `export --no-plugins` excludes plugin list
  - `import <file>` restores with `--dry-run` preview
  - `import --yes` skips confirmation

#### FR-8: Health Diagnostics
- **Description:** Verify runtimes, env vars, process spawn, and JSON-RPC handshake
- **Acceptance Criteria:**
  - `doctor` checks: Node runtime, env vars, file permissions, server connectivity
  - `doctor <server>` focuses on specific server diagnostics
  - `test <server>` validates JSON-RPC initialize + tools/list response
  - `test --all` validates all installed servers
  - Reports detailed errors and remediation steps

#### FR-9: Server Profiling
- **Description:** Save/restore named server configuration snapshots (v0.6.0+)
- **Acceptance Criteria:**
  - `profiles create <name>` snapshots current lockfile as profile
  - `profiles switch <name>` applies profile to lockfile
  - `profiles list` shows all profiles with timestamps
  - `profiles delete <name>` removes profile
  - Useful for environment switching (dev/staging/prod)

#### FR-10: Self-Upgrade (v0.6.0+)
- **Description:** Update mcpman CLI itself via npm
- **Acceptance Criteria:**
  - `upgrade` checks npm for latest version, prompts user
  - `upgrade --check` only checks without installing
  - Uses npx to fetch and execute installer (no sudo required)
  - Preserves config, vault, lockfile across upgrade

### Non-Functional Requirements (NFR)

#### NFR-1: Security
- **Implementation:** AES-256-CBC + PBKDF2 vault encryption, OSV vulnerability scanning
- **Target:** No secrets in plaintext JSON, proactive vuln detection, trust scoring

#### NFR-2: Performance
- **Implementation:** Caching (24h for update checks), lazy-load plugins, async operations
- **Target:** `install` < 5s (np registry), `doctor` < 10s, `audit` < 30s (OSV API)

#### NFR-3: Reliability
- **Implementation:** 325+ test cases, CI/CD validation (GitHub Actions), graceful error handling
- **Target:** Zero data loss on vault/lockfile, rollback on sync failures

#### NFR-4: Usability
- **Implementation:** Interactive prompts (@clack/prompts), colored output (picocolors), --help, --json outputs
- **Target:** First-time user can install server in < 2min without docs

#### NFR-5: Extensibility
- **Implementation:** Plugin system, npm-based, no built-in registry hardcoding
- **Target:** Custom registries via npm packages, no core changes needed

#### NFR-6: Compatibility
- **Implementation:** Node ≥20, tested on macOS/Windows/Linux
- **Target:** Works across all platforms, all major AI clients

### Success Metrics (v0.6.0)

| Metric | Target | Current |
|--------|--------|---------|
| npm downloads/week | 500+ | Growing |
| GitHub stars | 100+ | 80+ |
| Test coverage | >80% | 85%+ (325 tests) |
| CLI commands | 20+ | 20 (all implemented) |
| Supported clients | All 4 major | Claude, Cursor, VS Code, Windsurf |
| Security audits/month | 1000+ | Scaling |
| Plugin registrations | 3+ | 1 example (extensible) |
| Production uptime | 99%+ | Stable releases |

## Architecture Overview

```
mcpman CLI
  ├── citty (command routing)
  ├── clients/ (client config handlers)
  │   └── detect + read/write config
  ├── commands/ (20 subcommands)
  │   └── install, list, remove, sync, doctor, audit, etc.
  └── core/ (21 modules)
      ├── registry (npm/Smithery resolution)
      ├── vault (AES-256-CBC encryption)
      ├── sync-engine (multi-client sync)
      ├── security-scanner (OSV scanning)
      ├── plugin-loader (npm plugin resolution)
      ├── profile-service (v0.6.0: profile snapshots)
      └── ...
```

**Data Flow:**
1. User runs `mcpman install @modelcontextprotocol/server-filesystem`
2. Registry resolves package → installer downloads + validates
3. Lockfile updated, env vars prompted
4. Vault stores secrets, sync-engine registers in all clients
5. Doctor validates connectivity

## Roadmap (v0.7+)

- **v0.7.0:** Dashboard/WebUI for config visualization
- **v0.8.0:** Desktop GUI (Tauri-based)
- **v0.9.0:** Team collaboration (shared vault, RBAC)
- **v1.0.0:** Stable API, production SLA

## Competitive Analysis

| Feature | mcpman | Smithery CLI | mcpm.sh |
|---------|--------|--------------|---------|
| Multi-client | ✓ 4 clients | ✗ Claude only | ✗ Limited |
| Lockfile | ✓ mcpman.lock | ✗ None | ✗ None |
| Vault | ✓ AES-256-CBC | ✗ None | ✗ None |
| Sync | ✓ Cross-client | ✗ None | ✗ None |
| Security audit | ✓ Trust score | ✗ None | ✗ None |
| Plugin system | ✓ npm-based | ✗ None | ✗ None |
| Export/Import | ✓ Full portability | ✗ None | ✗ None |
| Profiles | ✓ Named configs | ✗ None | ✗ None |
| Self-upgrade | ✓ Built-in | ✗ None | ✗ None |
| Automation | ✓ CI/CD ready | ✗ Manual | ✗ Scripts |

## Release History

**v0.1.0 (2026-02-27):** MVP — install, list, remove, sync, doctor
**v0.2.0 (2026-02-28):** Vault, audit, update, notification
**v0.3.0 (2026-02-28):** Vault-installer integration, audit --fix, CI/CD
**v0.4.0 (2026-02-28):** config, search, info, run
**v0.5.0 (2026-02-28):** plugin system, export/import
**v0.6.0 (2026-02-28):** profiles, upgrade, logs, test, Smithery API fix, plugin health checks

## Stakeholders

- **Primary Users:** Developers using Claude, Cursor, VS Code, Windsurf with MCP servers
- **Secondary:** Teams sharing MCP configurations via Git/portability
- **Ecosystem:** Plugin authors extending mcpman with custom registries
- **Platform:** Anthropic (Claude), Anysphere (Cursor), Codeium (Windsurf), Microsoft (VS Code)

## Constraints & Assumptions

**Constraints:**
- Node ≥20 required (modern async/await syntax)
- npm/Smithery APIs external dependencies
- Platform-specific config paths (macOS/Windows/Linux variations)

**Assumptions:**
- Users have npm installed or npx available
- AI clients follow config file standards (JSON)
- MCP servers respond to JSON-RPC initialize + tools/list
- Users accept password-protected vault for secrets

## Success Definition

mcpman reaches v1.0 success when:
1. 1000+ weekly npm downloads
2. 10+ production-grade plugins available
3. Zero critical security issues in audits
4. <5% error rate on install/sync operations
5. 99%+ uptime for registry integrations
6. Adoption by 50%+ of MCP server developers
