# mcpman Codebase Summary

**Version:** 0.6.0
**Last Updated:** 2026-02-28
**Tech Stack:** TypeScript + Node.js ≥20, citty CLI, @clack/prompts, vitest v4

## Project Overview

mcpman is a universal package manager for Model Context Protocol (MCP) servers. It enables installing, managing, and inspecting MCP servers across all major AI clients (Claude Desktop, Cursor, VS Code, Windsurf) from a single CLI.

**Repository:** https://github.com/tranhoangtu-it/mcpman
**npm:** https://www.npmjs.com/package/mcpman

## Directory Structure

```
src/
├── index.ts                    # CLI entry point (20 subcommands via citty)
├── clients/                    # AI client integrations
│   ├── base-client-handler.ts  # Abstract base for client handlers
│   ├── client-detector.ts      # Auto-detect installed clients
│   ├── claude-desktop.ts       # Claude Desktop config
│   ├── cursor.ts               # Cursor IDE support
│   ├── vscode.ts               # VS Code integration
│   ├── windsurf.ts             # Windsurf IDE support
│   └── types.ts                # ClientType, ConfigFile interfaces
├── commands/                   # 20 subcommands (from install to import)
│   ├── install.ts              # Install MCP servers
│   ├── list.ts                 # List installed servers
│   ├── remove.ts               # Uninstall servers
│   ├── doctor.ts               # Health diagnostics
│   ├── secrets.ts              # Vault secret management
│   ├── sync.ts                 # Cross-client config sync
│   ├── audit.ts                # Security vulnerability scan
│   ├── update.ts               # Check/apply server updates
│   ├── upgrade.ts              # Self-upgrade mcpman CLI
│   ├── config.ts               # Global config CRUD
│   ├── search.ts               # Registry search (npm/Smithery)
│   ├── info.ts                 # Package details + trust score
│   ├── run.ts                  # Launch servers with vault secrets
│   ├── logs.ts                 # Stream server stdout/stderr
│   ├── test-command.ts         # JSON-RPC validation
│   ├── profiles.ts             # Named config profiles
│   ├── plugin.ts               # Plugin management
│   ├── export-command.ts       # Export config bundles
│   ├── import-command.ts       # Restore from bundles
│   └── init.ts                 # Init project mcpman.lock
├── core/                       # 21 core modules
│   ├── installer.ts            # Package installation logic
│   ├── lockfile.ts             # mcpman.lock parsing
│   ├── registry.ts             # npm registry client (fixed Smithery API)
│   ├── registry-search.ts      # Search + pagination
│   ├── server-resolver.ts      # Resolve npm/GitHub URLs
│   ├── server-inventory.ts     # Track installed servers
│   ├── server-updater.ts       # Version checking + updates
│   ├── health-checker.ts       # Runtime/env/process validation
│   ├── diagnostics.ts          # Detailed health reports
│   ├── mcp-process-checks.ts   # Check running MCP processes
│   ├── vault-service.ts        # AES-256-CBC encrypted secrets
│   ├── vault-helpers.ts        # Vault integration utilities
│   ├── security-scanner.ts     # OSV vulnerability scanning
│   ├── trust-scorer.ts         # Trust score computation
│   ├── sync-engine.ts          # Multi-client config sync
│   ├── config-service.ts       # ~/.mcpman/config.json CRUD
│   ├── config-diff.ts          # Sync change detection
│   ├── plugin-loader.ts        # npm plugin loading
│   ├── plugin-health-checker.ts # v0.6.0: Plugin diagnostics
│   ├── profile-service.ts      # v0.6.0: Profile CRUD
│   ├── mcp-tester.ts           # v0.6.0: JSON-RPC validator
│   ├── export-import-service.ts # Bundle import/export
│   ├── package-info.ts         # Package metadata
│   └── version-checker.ts      # Version comparison utils
└── utils/
    ├── constants.ts            # APP_NAME, APP_VERSION (0.6.0)
    ├── logger.ts               # Logging utilities
    └── paths.ts                # File path resolution (+ getProfilesDir())

tests/
├── 26 test files               # 325 test cases covering all commands
└── Test structure mirrors src/ (unit, integration, e2e)
```

## Key Modules (v0.6.0)

### New in v0.6.0

**profile-service.ts** — Named server configuration profiles
- `createProfile(name, desc)` — snapshot current lockfile as profile
- `loadProfile(name)` — apply profile to lockfile
- `listProfiles()` — enumerate ~/.mcpman/profiles/*.json
- `deleteProfile(name)` — remove profile

**mcp-tester.ts** — JSON-RPC server validation
- `testMcpServer(cmd, args)` — launch server, send initialize RPC, tools/list
- Returns: pass/fail, response time, discovered tools

**plugin-health-checker.ts** — Plugin diagnostic support
- Integrates with doctor command
- Validates plugin registry availability

### Core Utilities

**vault-service.ts** — AES-256-CBC + PBKDF2 encryption
- Stores in ~/.mcpman/vault.enc
- Auto-loads during install, offers save after
- Secrets auto-injected into process.env for `run` and `logs`

**sync-engine.ts** — Multi-client config synchronization
- Detects all 4 clients, compares lockfile vs actual configs
- `--remove` flag cleans extra servers from clients
- `--dry-run` previews changes; `--source` picks primary client

**security-scanner.ts** — OSV API vulnerability scanning
- Queries https://api.osv.dev for package vulnerabilities
- Trust score (0–100) based on: vuln count, download velocity, age, publish frequency
- `audit --fix` auto-updates vulnerable npm packages

**registry.ts** (fixed in v0.6.0) — Package resolution
- npm registry: `/v1/search?text=query&size=20`
- Smithery API: `/api/packages?qualifiedName=prefix:server&useCount=100&pageSize=20`
- GitHub URL: direct .git resolution

## Command Architecture

Each command follows citty subcommand pattern:
```typescript
defineCommand({
  meta: { name, description },
  args: { /* positional + flags */ },
  async run({ args }) { /* execute */ }
})
```

**Command categories:**
1. **Server Management:** install, list, remove, update, upgrade
2. **Health & Diagnostics:** doctor, test, logs, audit
3. **Configuration:** config, secrets, sync, profiles
4. **Discovery:** search, info, run
5. **Extensibility:** plugin, export, import
6. **Initialization:** init

## Data Files

**~/.mcpman/**
- `config.json` — global config (defaultClient, updateCheckInterval, preferredRegistry, vaultTimeout, plugins)
- `vault.enc` — encrypted API keys/secrets (AES-256-CBC)
- `mcpman.lock` — current working directory lockfile (if `mcpman init` run)
- `plugins/` — npm-installed plugin packages
- `profiles/` — named server configs (v0.6.0+)

**Client Config Paths:**
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- Cursor: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/mcp.json` (macOS)
- VS Code: `~/Library/Application Support/Code/User/settings.json` (macOS)
- Windsurf: `~/Library/Application Support/Windsurf/User/globalStorage/windsurf.mcpConfigJson/mcp.json` (macOS)

## Testing

**26 test files, 325+ test cases**
Test structure mirrors `src/` organization:
- Unit tests: individual functions, error cases
- Integration tests: command flows (install → sync → audit)
- Mock client configs for isolation

**Test Commands:**
```bash
npm test           # watch mode
npm run test:run   # single run
```

## Build & Release

**Build:**
```bash
npm run build      # tsup: outputs dist/index.cjs, index.mjs, index.d.ts
npm run lint:fix   # biome format
```

**Publish:**
- Binary: `./dist/index.cjs` (npm bin field)
- Version bumped in package.json AND src/utils/constants.ts
- npm 2FA required; granular token bypass needed for CI

**Versions:**
- v0.2.0: Vault + sync + audit + update
- v0.3.0: Vault installer, sync --remove, audit --fix, CI/CD
- v0.4.0: config, search, info, run
- v0.5.0: plugin system, export/import, README
- v0.6.0: profiles, upgrade, logs, test, plugin health checks, Smithery API fix

## Key Decisions

1. **Binary Format:** `index.cjs` not `.mjs` — npm requires CJS for bin field
2. **Encryption:** AES-256-CBC + PBKDF2 (not bcrypt) for vault
3. **Multi-client:** All 4 clients detected auto; `--client` flag restricts
4. **Registry:** npm primary; Smithery for MCP-specific; GitHub via direct .git URLs
5. **Plugin Prefix:** e.g. `ollama:my-model` resolved via plugin's `resolve()` export
6. **Smithery API:** Real response shape: `qualifiedName`, `useCount`, `pageSize` (v0.6.0 fix)

## Dependencies

**Runtime:** citty (CLI), @clack/prompts (interactive), picocolors (colors), nanospinner (spinners)
**Dev:** TypeScript 5.7, biome 1.9 (linting + formatting), vitest 4, tsup 8

Node ≥20 required.
