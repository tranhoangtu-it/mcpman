# mcpman System Architecture

**Version:** 0.6.0
**Last Updated:** 2026-02-28

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     mcpman CLI (index.ts)                    │
│                   20 subcommands via citty                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐        ┌─────────┐      ┌──────────┐
    │Clients │        │Commands │      │Core Logic│
    └────────┘        └─────────┘      └──────────┘
        │                  │                  │
        │              install               │
        │              list                  │
        │              remove                │
        │              sync ◄──────────┐    │
        │              doctor         │     │
        │              audit          │ ┌───┴──────────────┐
        │              update         │ │ registry.ts      │
        │              upgrade        │ │ vault-service    │
        │              config         │ │ sync-engine      │
        │              search         │ │ security-scanner │
        │              info           │ │ profile-service  │
        │              run            │ │ mcp-tester       │
        │              logs           │ │ plugin-loader    │
        │              test           │ └──────────────────┘
        │              profiles       │
        │              plugin         │
        │              export/import  │
        │              secrets        │
        │              init           │
        └─────────────┬────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   ┌────────────┐ ┌────────┐  ┌──────────┐
   │4 AI Clients│ │Lockfile│  │Vault+CFG │
   │Configs     │ │JSON    │  │Encrypted │
   └────────────┘ └────────┘  └──────────┘
```

## Component Organization

### 1. CLI Entry Point (`src/index.ts`)

- Uses citty framework for command routing
- Defines 20 subcommands (install, list, remove, ..., export, import)
- Graceful SIGINT handling (Ctrl+C abort)
- Exports all commands and runs main

### 2. Client Handlers (`src/clients/`)

**Purpose:** Abstract platform-specific AI client config file locations and schemas

**Files:**
- `types.ts` — ClientType enum ("claude-desktop", "cursor", "vscode", "windsurf"), ConfigFile interface
- `base-client-handler.ts` — Abstract base; handles config read/write/merge
- `claude-desktop.ts`, `cursor.ts`, `vscode.ts`, `windsurf.ts` — Platform-specific implementations
- `client-detector.ts` — Auto-detect installed clients via file/folder existence

**Key Methods:**
- `detectClients()` — returns array of installed ClientType
- `getClientHandler(type)` — factory returns platform handler
- `handler.readConfig()` — parse JSON, auto-merge with existing
- `handler.writeConfig()` — preserve non-MCP fields, write only MCP section

**Data Structure:** Each client maintains `mcpServers` object:
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

### 3. Commands (`src/commands/`)

Each command is a citty subcommand with args parsing and async execution.

**Server Lifecycle Commands:**
- `install.ts` — registry resolve → download → install → prompt env vars → register clients → save lockfile
- `list.ts` — read lockfile + each client config → display table with cross-registration status
- `remove.ts` — unregister from all clients, remove lockfile entry
- `update.ts` — check registry for newer versions, prompt install
- `upgrade.ts` (v0.6.0) — check npm for mcpman CLI updates, launch npm install

**Health & Validation:**
- `doctor.ts` — run health checks on all or specific server: runtime, env vars, connectivity, process spawn
- `test.ts` (v0.6.0) — JSON-RPC initialize request, tools/list, measure response time
- `logs.ts` (v0.6.0) — spawn server process, stream stdout/stderr with vault secret injection

**Configuration Management:**
- `config.ts` — CRUD ~/.mcpman/config.json (defaultClient, updateCheckInterval, preferredRegistry, vaultTimeout, plugins)
- `secrets.ts` — vault key/value CRUD via `secrets set <server> KEY=value`
- `sync.ts` — compare lockfile to client configs, preview/apply diffs, optional --remove cleanup
- `profiles.ts` (v0.6.0) — create/switch/list/delete named lockfile snapshots

**Discovery & Inspection:**
- `search.ts` — npm/Smithery registry search with pagination
- `info.ts` — package metadata, trust score, installed clients status
- `run.ts` — launch server with vault secrets auto-injected into process.env

**Extensibility:**
- `plugin.ts` — add/remove/list npm-based plugins from ~/.mcpman/plugins
- `export.ts` — bundle config + lockfile + vault + plugins as JSON
- `import.ts` — restore from bundle with --dry-run preview
- `audit.ts` — security scanning: OSV API vulnerabilities + trust scoring

**Initialization:**
- `init.ts` — create project-scoped mcpman.lock in cwd

### 4. Core Modules (`src/core/`)

**Registry & Resolution:**

`registry.ts` — Package resolution (v0.6.0 fixed Smithery API)
- `searchNpm(query, limit)` — POST /v1/search?text=X&size=N
- `searchSmithery(query, limit)` — GET /api/packages?qualifiedName=prefix:server&useCount=100&pageSize=N (real API)
- `resolveGitHub(url)` — clone + inspect .git, find package.json
- Returns: package name, version, description, registry source

`server-resolver.ts` — Resolve input to npm/GitHub/plugin
- `resolve("@scope/name")` → npm package
- `resolve("https://github.com/...")` → GitHub URL
- `resolve("prefix:server")` → plugin registry via plugin-loader

`registry-search.ts` — Pagination, filtering, deduplication
- Combines npm + Smithery + plugin registries (if --all)

**Installation & Management:**

`installer.ts` — Download, extract, manage server binaries
- `install(server, options)` — full install flow
- Calls `server-resolver.resolve()` → downloads tar → extracts to ~/.mcpman/servers/
- Stores file permissions, checksums in lockfile
- Prompts for env vars, optionally saves to vault

`lockfile.ts` — mcpman.lock parsing and writing
- LockfileData interface: servers[], version, timestamp
- Each server: name, version, source, runtime (node/python/bash), env vars, checksum
- Read/write JSON with migration support

`server-inventory.ts` — Track installed servers globally
- Enumerate ~/.mcpman/servers/, ~/.mcpman/profiles/
- Detect version mismatches, orphaned files

**Security & Validation:**

`vault-service.ts` — AES-256-CBC + PBKDF2 encryption
- `setSecret(server, key, value)` — encrypt + save to ~/.mcpman/vault.enc
- `getSecret(server, key)` — decrypt, auto-timeout after configurable interval
- Uses crypto.subtle.deriveBits (Node 20+)
- Password prompt + optional remember

`security-scanner.ts` — OSV API vulnerability scanning
- `scanPackage(name, version)` — query https://api.osv.dev/v1/query
- Returns: vulnerabilities[], severity, dates
- Integrated in `audit` command

`trust-scorer.ts` — Compute trust score (0–100)
- Factors: vulnerability count (-30 per major), download velocity, package age, publish frequency, maintainer signals
- Used in `info` and `audit` commands

**Health & Diagnostics:**

`health-checker.ts` — Runtime and env var validation
- `checkRuntime(server)` — verify node/python/bash available
- `checkEnvVars(server)` — validate required env vars set or in vault
- `checkPermissions(path)` — verify read/execute on binary

`diagnostics.ts` — Detailed health report
- Collects health checks, formats output, suggests fixes

`mcp-process-checks.ts` — Detect running MCP servers
- `getRunningServers()` — ps grep + port scanning

`mcp-tester.ts` (v0.6.0) — JSON-RPC validator
- Launch server → JSON-RPC initialize request → tools/list
- Measure response time, report pass/fail

**Configuration & Sync:**

`config-service.ts` — ~/.mcpman/config.json CRUD
- `getConfig()`, `setConfig(key, value)`, `resetConfig()`
- Keys: defaultClient, updateCheckInterval, preferredRegistry, vaultTimeout, plugins

`config-diff.ts` — Compare lockfile vs client configs
- Returns: added servers, removed, env var changes
- Used by `sync --dry-run`

`sync-engine.ts` — Multi-client synchronization
- `detectDrift()` — compare lockfile to all 4 clients
- `syncToClients(lockfile, options)` — register/update servers in clients
- `removeExtras(lockfile)` — clean servers not in lockfile from clients
- Supports `--source` to use one client as primary

**Plugins & Extensibility:**

`plugin-loader.ts` — npm-based plugin resolution
- `loadPlugins()` — enumerate ~/.mcpman/plugins/*/package.json
- `resolveViaPlugin(prefix, server)` — call plugin.resolve(server, options)
- Plugin interface: { name, prefix, resolve(server, options) }

`plugin-health-checker.ts` (v0.6.0) — Plugin diagnostics
- `checkPluginRegistry(pluginName)` — validate plugin's registry endpoint
- Integrated in `doctor` command

**Profiles & Portability:**

`profile-service.ts` (v0.6.0) — Named lockfile snapshots
- `createProfile(name, desc)` — copy current mcpman.lock to ~/.mcpman/profiles/{name}.json
- `loadProfile(name)` — apply profile servers to lockfile
- `listProfiles()` — enumerate profiles with metadata
- `deleteProfile(name)` — remove profile

`export-import-service.ts` — Full config portability
- `export(options)` — serialize config + lockfile + vault (AES-256 cipher text) + plugins
- `import(file, options)` — deserialize, validate, prompt before applying
- Supports `--dry-run` for preview

**Utilities:**

`package-info.ts` — Fetch npm package metadata
- `getPackageInfo(name)` — GET /registry/name → description, versions[], downloads
- Cached for performance

`version-checker.ts` — Version comparison and checking
- `compareVersions(v1, v2)` — semantic version comparison
- `checkForUpdates(currentVersion)` — check npm for newer releases
- 24h cache to avoid API spam

`server-updater.ts` — Shared update logic
- Used by both `update` and `audit --fix` commands
- Checks for newer versions, prompts, applies update

### 5. Utils (`src/utils/`)

`constants.ts` — APP_NAME, APP_VERSION, APP_DESCRIPTION
- Version sourced here and package.json must match

`logger.ts` — Logging with colors (picocolors) and spinners (nanospinner)
- `info()`, `warn()`, `error()`, `success()`, `spinner()`

`paths.ts` — Cross-platform file path resolution
- `getMcpmanDir()` → ~/.mcpman/
- `getProfilesDir()` (v0.6.0) → ~/.mcpman/profiles/
- `resolveConfigPath(clientType)` → platform-specific client config path

## Data Flow Diagrams

### Install Flow
```
install <server>
  ↓
args parser (name, --client, --json)
  ↓
server-resolver.resolve(name) → {name, version, source}
  ↓
installer.install() → download + validate + extract
  ↓
prompt env vars (via @clack/prompts)
  ↓
secrets.setSecret() [optional]
  ↓
lockfile.update(server)
  ↓
sync-engine.syncToClients() → register in Claude, Cursor, VS Code, Windsurf
  ↓
health-checker.checkRuntime() → validate
  ↓
output success + summary
```

### Sync Flow
```
sync [--dry-run] [--source <client>] [--remove]
  ↓
if --source: use client config as truth
else: use mcpman.lock as truth
  ↓
detect all clients
  ↓
config-diff.detectDrift() → {added, removed, changed}
  ↓
if --dry-run: print preview + exit
  ↓
for each client:
  sync-engine.syncToClients()
  if --remove: remove extras not in lockfile
  ↓
health-checker.checkAll() → validate
  ↓
output success + summary
```

### Audit Flow
```
audit [<server>] [--fix] [--json]
  ↓
for each server in lockfile:
  security-scanner.scanPackage() → {vulns}
  trust-scorer.compute() → score
  ↓
if --fix:
  for each vuln: server-updater.update()
  re-scan to verify fix
  ↓
output report (JSON or table)
```

## External Dependencies

**npm Registry API:**
- `GET https://registry.npmjs.org/-/v1/search?text=X&size=N`
- `GET https://registry.npmjs.org/{package-name}`

**Smithery API (v0.6.0):**
- `GET https://api.smithery.ai/api/packages?qualifiedName=X:Y&useCount=100&pageSize=N` (real endpoint)

**OSV Vulnerability Database:**
- `POST https://api.osv.dev/v1/query` with package name/version

**GitHub:**
- Clone via `git` (must be installed)
- Resolve package.json from repo

## Error Handling

**Graceful Degradation:**
- Missing client config → skip that client, warn user
- Vault locked → prompt password, skip if declined
- Plugin missing → skip plugin, suggest install
- Network error → retry with backoff, suggest offline mode

**User Feedback:**
- Colored output: red errors, yellow warnings, green success
- Spinners for long operations (install, sync, audit)
- JSON output for scripting/CI (--json flag)

## Performance Considerations

- **Caching:** 24h update checks, plugin list cached
- **Async/Parallel:** Sync to multiple clients in parallel
- **Vault Timeout:** Auto-lock after 15min (configurable)
- **Registry Pagination:** Limit 20 results by default, max 100

## Security Model

1. **Secrets:** AES-256-CBC + PBKDF2 vault, password-protected
2. **Checksums:** Each server binary stored with SHA-256 checksum
3. **Trust Scoring:** Before install, compute trust (0–100) from OSV + metadata
4. **Audit:** Pre-deployment vulnerability scanning with auto-fix
5. **Isolation:** Each client config separate; sync preserves non-MCP fields

## Testing Architecture

**26 test files, 325+ test cases**
- **Unit tests:** Individual functions (vault, registry, lockfile parsing)
- **Integration tests:** Command flows (install → sync → audit)
- **Mock clients:** Fake Claude/Cursor/VS Code configs for isolation
- **Test data:** Sample packages, lockfiles, vault fixtures

Test commands:
```bash
npm test          # watch mode
npm run test:run  # single run
```

## Deployment Model

**Binary Distribution:** npm bin field → `./dist/index.cjs` (CJS, not ESM)
**Version Sync:** Bumped in `package.json` AND `src/utils/constants.ts`
**CI/CD:** GitHub Actions (test + publish on git tag)
**Self-Update:** `upgrade` command uses npm to fetch latest

## Scalability

- **Registries:** Plugin system allows custom registries without core changes
- **Clients:** Client handler abstraction supports adding new clients
- **Commands:** citty command routing supports adding subcommands
- **Data:** Lockfile size linear with server count (typically <100 servers)
