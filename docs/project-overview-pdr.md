# mcpman — Project Overview & PDR

**Current Version:** 1.0.0
**Release Date:** 2026-02-28
**Status:** Stable Release (10 versions shipped, 457 tests passing)

## Executive Summary

**mcpman** is a universal CLI package manager for Model Context Protocol (MCP) servers. It solves the fragmentation problem of managing MCP servers across multiple AI clients (Claude Desktop, Cursor, VS Code, Windsurf) by providing a single, unified interface for installation, configuration, security auditing, and lifecycle management.

**Key Differentiator:** Only tool combining multi-client support + lockfile + vault + security audit + plugin extensibility + config portability + developer tooling in a single CLI.

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
- `install <server>` registers server in all detected clients or specific `--client`
- `list` shows servers with version, runtime, source, client registration status
- `remove <server>` deregisters from all clients or specific client
- `update`, `upgrade`, `rollback`, `pin` manage the full server version lifecycle

#### FR-2: Cross-Client Synchronization
- `sync` compares lockfile to each client config, previews differences
- `--dry-run`, `--source <client>`, `--remove`, `--yes` flags
- `diff` shows a formatted diff of lockfile vs actual client configs

#### FR-3: Security Vault for Secrets
- `secrets set/list/remove` store secrets in `~/.mcpman/vault.enc` (AES-256-CBC + PBKDF2)
- Vault password-protected, locked after configurable timeout
- Secrets auto-injected into process.env during `install`, `run`, and `logs`

#### FR-4: Vulnerability Scanning & Trust Scoring
- `audit` queries OSV API for each package; returns vulnerability list
- Trust score (0–100): vuln count, download velocity, package age, publish frequency
- `audit --fix` auto-updates vulnerable packages; `audit --fix --yes` for CI

#### FR-5: Lockfile for Reproducibility
- `init` creates `mcpman.lock` in current directory (project-scoped)
- `install` and `remove` auto-update lockfile
- Lockfile committed to Git for reproducible team setups

#### FR-6: Plugin System for Extensibility
- `plugin add/remove/list` manages npm plugins at `~/.mcpman/plugins/`
- Plugin exports `McpmanPlugin`: `{ name, prefix, resolve(server, options) }`
- `install <prefix>:<server>` resolves via plugin's prefix
- `search --all` includes plugin registries

#### FR-7: Configuration Portability
- `export` saves full state bundle (config + lockfile + vault + plugins)
- `import <file>` restores with `--dry-run` preview and `--yes` for CI

#### FR-8: Health Diagnostics
- `doctor` checks Node runtime, env vars, file permissions, connectivity
- `test <server>` validates JSON-RPC initialize + tools/list response
- `status` shows aggregated server status across all clients

#### FR-9: Developer Tooling (v0.7+)
- `create` scaffolds a new MCP server project with boilerplate
- `link` links a local server directory into AI client configs
- `watch` auto-reloads clients when local server files change
- `completions` generates shell completions (bash/zsh/fish)
- `why` explains why a server is installed

#### FR-10: Advanced Management (v0.8+)
- `env` manages per-server environment variable overrides
- `bench` benchmarks server response latency and throughput
- `group` organizes servers into named groups for bulk operations
- `pin` locks a server to a specific version
- `rollback` reverts to the previous install state

#### FR-11: Automation & Workflows (v0.9+)
- `validate` validates lockfile and config schema
- `replay` replays installs from history log
- `alias` defines server name aliases
- `template` saves and applies reusable config templates
- `notify` manages update notification preferences

### Non-Functional Requirements (NFR)

| ID | Requirement | Implementation | Target |
|----|-------------|----------------|--------|
| NFR-1 | Security | AES-256-CBC vault, OSV scanning, trust scoring | No plaintext secrets |
| NFR-2 | Performance | 24h cache, lazy-load plugins, parallel async | install <5s, doctor <10s |
| NFR-3 | Reliability | 457 tests, CI/CD, graceful error handling | Zero data loss on vault/lockfile |
| NFR-4 | Usability | @clack/prompts, colored output, --json, --help | First install in <2min |
| NFR-5 | Extensibility | npm plugin system, no hardcoded registries | Custom registries via plugins |
| NFR-6 | Compatibility | Node ≥20, tested macOS/Windows/Linux | All 4 major AI clients |

### Success Metrics (v1.0.0)

| Metric | v0.6 Baseline | v1.0 Target | Status |
|--------|--------------|-------------|--------|
| CLI commands | 20 | 38 | 38 achieved |
| Test coverage | 325 tests | 400+ tests | 457 tests |
| Supported clients | 4 | 4 | 4 |
| Source files | ~50 | 90+ | 92 |
| npm downloads/week | 200+ | 1,000+ | Growing |
| GitHub stars | 80+ | 500+ | Growing |
| Production uptime | Stable | 99%+ | Stable |

## Architecture Overview

```
mcpman CLI (38 commands)
  ├── src/clients/     (7 files) — Claude Desktop, Cursor, VS Code, Windsurf
  ├── src/commands/   (38 files) — one file per subcommand
  ├── src/core/       (43 files) — business logic services
  └── src/utils/       (3 files) — logger, paths, constants
```

**Install data flow:**
1. `server-resolver` resolves input → npm / GitHub / plugin prefix
2. `installer` downloads, validates checksum, extracts binary
3. `installer-vault-helpers` pre-fills env vars from vault
4. `lockfile` records server entry
5. `sync-engine` registers server in all detected AI clients
6. `health-checker` validates runtime and connectivity

## Competitive Analysis

| Feature | mcpman | Smithery CLI | mcpm.sh |
|---------|--------|--------------|---------|
| Multi-client (4) | Yes | Claude only | Limited |
| Lockfile | Yes | No | No |
| Encrypted vault | Yes | No | No |
| Cross-client sync | Yes | No | No |
| Security audit | Yes | No | No |
| Plugin system | Yes | No | No |
| Export/import | Yes | No | No |
| Dev tooling | Yes | No | No |
| CI/CD ready | Yes | Manual | Scripts |

## Release History

| Version | Date | Highlight |
|---------|------|-----------|
| v0.1.0 | 2026-02-27 | MVP: install, list, remove, sync, doctor |
| v0.2.0 | 2026-02-28 | Vault, audit, update |
| v0.3.0 | 2026-02-28 | Vault-installer integration, CI/CD |
| v0.4.0 | 2026-02-28 | config, search, info, run |
| v0.5.0 | 2026-02-28 | Plugin system, export/import |
| v0.6.0 | 2026-02-28 | profiles, upgrade, logs, test |
| v0.7.0 | 2026-02-28 | create, link, watch, registry, completions, why |
| v0.8.0 | 2026-02-28 | env, bench, diff, group, pin, rollback |
| v0.9.0 | 2026-02-28 | validate, status, replay, alias, template, notify |
| v1.0.0 | 2026-02-28 | Stable API, 38 commands, 457 tests |

## Stakeholders

- **Primary Users:** Developers using Claude, Cursor, VS Code, Windsurf with MCP servers
- **Secondary:** Teams sharing MCP configurations via Git or export bundles
- **Ecosystem:** Plugin authors extending mcpman with custom registries
- **Platforms:** Anthropic (Claude), Anysphere (Cursor), Codeium (Windsurf), Microsoft (VS Code)

## Constraints & Assumptions

**Constraints:**
- Node ≥20 required (modern crypto, async/await, ES2022 private fields)
- npm and Smithery APIs are external dependencies
- Platform-specific config paths vary across macOS/Windows/Linux

**Assumptions:**
- Users have npm/npx available
- AI clients store config as JSON files
- MCP servers respond to JSON-RPC initialize + tools/list
- Users accept password-protected vault for secrets

## v1.0 Success Definition

mcpman v1.0 is successful when:
1. All 38 commands stable with no regressions across Node 20/22
2. Zero critical security issues in OSV audit of own dependencies
3. Plugin interface frozen — community plugins work without updates
4. <5% error rate on install/sync operations in CI environments
5. Adopted as reference implementation by MCP server developers
