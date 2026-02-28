# mcpman System Architecture

**Version:** 1.0.0
**Last Updated:** 2026-02-28

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     mcpman CLI (index.ts)                    │
│                   38 subcommands via citty                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐        ┌─────────┐      ┌──────────┐
    │Clients │        │Commands │      │Core Logic│
    └────────┘        └─────────┘      └──────────┘
        │                  │                  │
   4 AI clients       38 subcommands     43 modules
        │                                     │
        ▼                                     ▼
   ┌────────────┐ ┌────────┐  ┌──────────┐  ┌──────────┐
   │4 AI Client │ │Lockfile│  │Vault.enc │  │Config    │
   │Configs     │ │JSON    │  │AES-256   │  │JSON      │
   └────────────┘ └────────┘  └──────────┘  └──────────┘
```

## Component Organization

### 1. CLI Entry Point (`src/index.ts`)

- citty framework for command routing and argument parsing
- 38 subcommands registered at startup
- Graceful SIGINT handling (Ctrl+C abort)

### 2. Client Handlers (`src/clients/`)

**Purpose:** Abstract platform-specific AI client config locations and schemas.

| File | Responsibility |
|------|----------------|
| `types.ts` | `ClientType` enum, `ConfigFile` interface |
| `base-client-handler.ts` | Abstract read/write/merge base |
| `claude-desktop.ts` | Claude Desktop macOS/Windows/Linux paths |
| `cursor.ts` | Cursor IDE config integration |
| `vscode.ts` | VS Code settings.json integration |
| `windsurf.ts` | Windsurf IDE config integration |
| `client-detector.ts` | Auto-detect installed clients via path existence |

**Data Structure:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": { "API_KEY": "secret" }
    }
  }
}
```

### 3. Commands (`src/commands/`) — 38 subcommands

| Category | Commands |
|----------|---------|
| Server Lifecycle | install, list, remove, update, upgrade, rollback, pin |
| Health & Diagnostics | doctor, test, logs, audit, status, bench |
| Configuration | config, secrets, sync, profiles, diff, env, validate |
| Discovery | search, info, run, why |
| Extensibility | plugin, export, import, template |
| Development | create, link, watch, completions |
| Organization | group, alias, registry, notify, replay, init |

Each command uses citty's `defineCommand({ meta, args, async run({ args }) })` pattern.

### 4. Core Modules (`src/core/`) — 43 modules

**Registry & Resolution:**
`registry.ts` (npm + Smithery API), `server-resolver.ts` (npm/GitHub/plugin), `registry-search.ts` (pagination + dedup), `registry-manager.ts` (custom registries)

**Installation & Management:**
`installer.ts` (full install flow), `installer-vault-helpers.ts` (vault integration), `lockfile.ts` (parse/write), `server-inventory.ts` (enumerate installed), `server-updater.ts` (shared update logic)

**Security & Validation:**
`vault-service.ts` (AES-256-CBC + PBKDF2), `security-scanner.ts` (OSV API), `trust-scorer.ts` (0–100 score), `config-validator.ts` (JSON schema)

**Health & Diagnostics:**
`health-checker.ts` (runtime/env/permissions), `diagnostics.ts` (structured report), `mcp-process-checks.ts` (running processes), `mcp-tester.ts` (JSON-RPC validate), `status-checker.ts` (aggregate status)

**Configuration & Sync:**
`config-service.ts` (`~/.mcpman/config.json`), `config-diff.ts` (drift detection), `config-differ.ts` (diff utilities), `sync-engine.ts` (multi-client sync)

**Plugins & Extensibility:**
`plugin-loader.ts` (load + resolve), `plugin-health-checker.ts` (registry validation)

**Profiles & Portability:**
`profile-service.ts` (`~/.mcpman/profiles/`), `export-import-service.ts` (full state bundle)

**Developer Tooling (v0.7+):**
`scaffold-service.ts`, `link-service.ts`, `file-watcher-service.ts`, `why-service.ts`, `completion-generator.ts`

**Advanced Management (v0.8+):**
`env-manager.ts`, `bench-service.ts`, `group-manager.ts`, `pin-service.ts`, `rollback-service.ts`, `history-service.ts`

**Automation (v0.9+):**
`alias-manager.ts`, `template-service.ts`, `notify-service.ts`

**Utilities:**
- `package-info.ts` — npm package metadata (cached)
- `update-notifier.ts` — 24h-cached update notifications
- `version-checker.ts` — semantic version comparison

### 5. Utils (`src/utils/`)

| File | Responsibility |
|------|----------------|
| `constants.ts` | `APP_NAME`, `APP_VERSION`, `APP_DESCRIPTION` |
| `logger.ts` | Colored output (picocolors) + spinners (nanospinner) |
| `paths.ts` | Cross-platform path resolution (`getMcpmanDir`, `getProfilesDir`, etc.) |

## Key Data Flows

### Install Flow
```
install <server>
  → server-resolver.resolve() → {name, version, source}
  → installer.install() → download + validate + extract
  → installer-vault-helpers → pre-fill env from vault
  → lockfile.update(server)
  → applySyncActions() → register in all 4 clients
  → health-checker.checkRuntime() → validate
```

### Audit Flow
```
audit [--fix] [--json]
  → security-scanner.scanPackage() per server → vulns
  → trust-scorer.compute() → score 0–100
  → if --fix: server-updater.update() → re-scan
```

### Sync Flow
```
sync [--dry-run] [--source <client>] [--remove]
  → config-diff.detectDrift() → {added, removed, changed}
  → if --dry-run: print preview + exit
  → applySyncActions() per client
  → if --remove: remove extras not in lockfile
```

## External APIs

| Service | Endpoint |
|---------|----------|
| npm search | `GET https://registry.npmjs.org/-/v1/search?text=X&size=N` |
| npm package | `GET https://registry.npmjs.org/{package-name}` |
| Smithery | `GET https://api.smithery.ai/api/packages?qualifiedName=X&pageSize=N` |
| OSV | `POST https://api.osv.dev/v1/query` |

## Error Handling

Graceful degradation — skip unavailable components rather than aborting:
- Missing client config → skip that client, warn user
- Vault locked and declined → skip secret injection, continue install
- Plugin registry unreachable → skip plugin results, return core results

Output: colored (red/yellow/green), spinners for long ops, `--json` for CI on all data commands.

## Security Model

1. AES-256-CBC + PBKDF2 vault — password-protected, auto-lock after configurable timeout
2. SHA-256 checksum per server binary in lockfile
3. Trust score (0–100) from OSV + npm metadata, surfaced during `info` and `install`
4. `audit --fix` for pre-deployment vulnerability remediation
5. Sync preserves non-MCP fields in each client config

## Testing

45 test files, 457 test cases — unit (vault, registry, lockfile), integration (install → sync → audit), mock client configs for isolation.

```bash
npm run test:run
npm run test:run -- --coverage
```

## Deployment

- Binary: `./dist/index.cjs` (CJS — required for npm bin field)
- Version synced in `package.json` AND `src/utils/constants.ts`
- CI/CD: GitHub Actions — test on push, publish on git tag
- Self-update: `mcpman upgrade` fetches latest via npm
