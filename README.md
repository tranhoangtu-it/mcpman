# mcpman

[![npm version](https://img.shields.io/npm/v/mcpman)](https://www.npmjs.com/package/mcpman)
[![npm downloads](https://img.shields.io/npm/dm/mcpman)](https://www.npmjs.com/package/mcpman)
[![GitHub stars](https://img.shields.io/github/stars/tranhoangtu-it/mcpman)](https://github.com/tranhoangtu-it/mcpman)
[![license](https://img.shields.io/npm/l/mcpman)](https://github.com/tranhoangtu-it/mcpman/blob/main/LICENSE)
![node](https://img.shields.io/node/v/mcpman)

**The package manager for MCP servers.**

Install, manage, and inspect Model Context Protocol servers across all your AI clients — Claude Desktop, Cursor, VS Code, and Windsurf — from a single CLI.

<p align="center">
  <img src="./demo.gif" alt="mcpman demo" width="700">
</p>

---

## Quick Start

```sh
# Install an MCP server globally (no install required)
npx mcpman install @modelcontextprotocol/server-filesystem

# Or install mcpman globally
npm install -g mcpman
mcpman install @modelcontextprotocol/server-filesystem
```

---

## Features

- **Universal** — manages servers for Claude Desktop, Cursor, VS Code, and Windsurf from one tool
- **Registry-aware** — resolves packages from npm, Smithery, or GitHub URLs
- **Lockfile** — tracks installed servers in `mcpman.lock` for reproducible setups
- **Health checks** — verifies runtimes, env vars, and server connectivity with `doctor`
- **Encrypted secrets** — store API keys in an AES-256 encrypted vault instead of plaintext JSON; auto-loads during install
- **Config sync** — keep server configs consistent across all your AI clients; `--remove` cleans extras
- **Security audit** — scan servers for vulnerabilities with trust scoring; `--fix` auto-updates vulnerable packages
- **Auto-update** — get notified when server updates are available
- **Plugin system** — extend mcpman with npm-based plugins for custom registries (e.g. Ollama, HuggingFace)
- **Export/Import** — portable JSON bundles for full config migration across machines
- **Server testing** — validate MCP servers respond to JSON-RPC initialize + tools/list
- **Log streaming** — stream stdout/stderr from servers in real time
- **Profiles** — save/restore named server configurations for quick switching
- **Self-upgrade** — update mcpman itself with a single command
- **Interactive prompts** — guided installation with env var configuration
- **No extra daemon** — pure CLI, works anywhere Node ≥ 20 runs

---

## Commands

### `install <server>`

Install an MCP server and register it with your AI clients.

```sh
mcpman install @modelcontextprotocol/server-filesystem
mcpman install my-smithery-server
mcpman install https://github.com/owner/repo
```

**Options:**
- `--client <type>` — target a specific client (`claude-desktop`, `cursor`, `vscode`, `windsurf`)
- `--json` — output machine-readable JSON

### `list`

List all installed MCP servers.

```sh
mcpman list
mcpman list --json
```

Shows server name, version, runtime, source, and which clients have it registered.

### `remove <server>`

Uninstall a server and deregister it from all clients.

```sh
mcpman remove @modelcontextprotocol/server-filesystem
```

### `doctor [server]`

Run health diagnostics on all installed servers or a specific one.

```sh
mcpman doctor
mcpman doctor my-server
```

Checks: runtime availability, required env vars, process spawn, and MCP handshake.

### `init`

Scaffold an `mcpman.lock` file in the current directory for project-scoped server management.

```sh
mcpman init
```

### `secrets`

Manage encrypted secrets for MCP servers (API keys, tokens, etc.).

```sh
mcpman secrets set my-server OPENAI_API_KEY=sk-...
mcpman secrets list my-server
mcpman secrets remove my-server OPENAI_API_KEY
```

Secrets are stored in `~/.mcpman/vault.enc` using AES-256-CBC encryption with PBKDF2 key derivation. During `install`, vault secrets are auto-loaded to pre-fill env vars, and new credentials can be saved after installation.

### `sync`

Sync MCP server configs across all detected AI clients.

```sh
mcpman sync              # sync all servers to all clients
mcpman sync --dry-run    # preview changes without applying
mcpman sync --source cursor  # use Cursor config as source of truth
mcpman sync --remove     # remove servers not in lockfile from clients
```

**Options:**
- `--dry-run` — preview changes without applying
- `--source <client>` — use a specific client config as source of truth
- `--remove` — remove extra servers from clients that aren't tracked in lockfile
- `--yes` — skip confirmation prompts

### `audit [server]`

Scan installed servers for security vulnerabilities and compute trust scores.

```sh
mcpman audit             # audit all servers
mcpman audit my-server   # audit specific server
mcpman audit --json      # machine-readable output
mcpman audit --fix       # auto-update vulnerable servers
mcpman audit --fix --yes # auto-update without confirmation
```

Trust score (0–100) based on: vulnerability count, download velocity, package age, publish frequency, and maintainer signals.

The `--fix` flag checks for newer versions of vulnerable npm packages, updates them, and re-scans to verify the fixes.

### `update [server]`

Check for and apply updates to installed MCP servers.

```sh
mcpman update            # update all servers
mcpman update my-server  # update specific server
mcpman update --check    # check only, don't apply
```

### `config <set|get|list|reset>`

Manage persistent CLI configuration at `~/.mcpman/config.json`.

```sh
mcpman config set defaultClient cursor
mcpman config get defaultClient
mcpman config list
mcpman config reset
```

Keys: `defaultClient`, `updateCheckInterval`, `preferredRegistry`, `vaultTimeout`, `plugins`.

### `search <query>`

Search for MCP servers on npm or Smithery registry.

```sh
mcpman search filesystem
mcpman search brave --registry smithery
mcpman search tools --all        # include plugin registries
mcpman search tools --limit 10
```

**Options:**
- `--registry <npm|smithery>` — registry to search (default: npm)
- `--limit <n>` — max results (default: 20, max: 100)
- `--all` — include plugin registries in results

### `info <server>`

Show detailed information about an MCP server package.

```sh
mcpman info @modelcontextprotocol/server-filesystem
mcpman info my-server --json
```

### `run <server>`

Launch an MCP server with vault secrets auto-injected into the process environment.

```sh
mcpman run my-server
mcpman run my-server --env API_KEY=sk-...
```

### `upgrade`

Upgrade mcpman itself to the latest version from npm.

```sh
mcpman upgrade           # check and install latest
mcpman upgrade --check   # only check, don't install
```

### `test [server]`

Validate MCP server connectivity by sending JSON-RPC `initialize` + `tools/list`.

```sh
mcpman test my-server    # test a specific server
mcpman test --all        # test all installed servers
```

Reports pass/fail, response time, and discovered tools for each server.

### `logs <server>`

Stream stdout/stderr from an MCP server process in real time.

```sh
mcpman logs my-server    # stream logs (Ctrl+C to stop)
```

Vault secrets are auto-injected into the server environment.

### `profiles <create|switch|list|delete>`

Manage named server configuration profiles for quick switching.

```sh
mcpman profiles create dev           # snapshot current servers as "dev"
mcpman profiles create prod -d "Production config"
mcpman profiles list                 # show all profiles
mcpman profiles switch dev           # apply "dev" profile to lockfile
mcpman profiles delete old           # remove a profile
```

After switching, run `mcpman sync` to apply the profile to all clients.

### `plugin <add|remove|list>`

Manage mcpman plugins for custom registries.

```sh
mcpman plugin add mcpman-plugin-ollama    # install plugin
mcpman plugin remove mcpman-plugin-ollama # uninstall plugin
mcpman plugin list                        # show installed plugins
```

Plugins are npm packages that export a `McpmanPlugin` interface with `name`, `prefix`, and `resolve()`. Once installed, their prefix (e.g. `ollama:`) works with `mcpman install ollama:my-model`.

### `export [output-file]`

Export mcpman config, lockfile, vault, and plugins to a portable JSON file.

```sh
mcpman export                    # default: mcpman-export.json
mcpman export backup.json
mcpman export --no-vault         # exclude encrypted vault
mcpman export --no-plugins       # exclude plugin list
```

### `import <file>`

Restore mcpman config, lockfile, vault, and plugins from an export bundle.

```sh
mcpman import mcpman-export.json
mcpman import backup.json --yes       # skip confirmation
mcpman import backup.json --dry-run   # preview without applying
```

### `create [name]`

Scaffold a new MCP server project with working boilerplate.

```sh
mcpman create my-server              # interactive prompts
mcpman create my-server --yes        # accept defaults
mcpman create my-server --runtime python  # Python template
```

Generates `package.json` (with `mcp` field), `src/index.ts`, and `tsconfig.json` for Node; or `pyproject.toml` and `main.py` for Python. Both templates implement the MCP protocol with a sample `hello` tool ready to run.

### `link [dir]`

Register a local MCP server directory with AI clients — like `npm link` but for MCP.

```sh
mcpman link .                        # link current directory
mcpman link ./path/to/server         # link specific directory
mcpman link . --client cursor        # link to specific client only
mcpman link . --name my-override     # override detected server name
```

Reads `package.json` or `pyproject.toml` to detect name, version, and entry point. Adds a lockfile entry with `source: "local"` and registers the absolute path in client configs. No file copying — edits are picked up immediately.

### `watch <server>`

Watch a local MCP server's source files and auto-restart on changes — like nodemon, built into mcpman.

```sh
mcpman watch my-server               # watch with defaults
mcpman watch my-server --dir ./src   # override watch directory
mcpman watch my-server --ext ts,js   # watch specific extensions
mcpman watch my-server --delay 500   # set debounce delay (ms)
mcpman watch my-server --clear       # clear terminal on restart
```

Uses Node.js built-in `fs.watch` (no chokidar). Debounces 300ms by default. Ignores `node_modules/`, `dist/`, `.git/`, `__pycache__/`. Vault secrets are injected same as `mcpman run`.

### `registry <list|add|remove|set-default>`

Manage custom registry URLs for MCP server resolution.

```sh
mcpman registry list                              # show all registries
mcpman registry add corp https://mcp.corp.com/api # add custom registry
mcpman registry remove corp                       # remove custom registry
mcpman registry set-default smithery             # change default registry
```

Built-in registries (npm, smithery) are always present and cannot be removed. Custom registries are stored in `~/.mcpman/config.json`.

### `completions <bash|zsh|fish|install>`

Generate shell completion scripts for tab-completion of commands and server names.

```sh
mcpman completions bash              # output bash completion script
mcpman completions zsh               # output zsh completion script
mcpman completions fish              # output fish completion script
mcpman completions install           # auto-detect shell and install
source <(mcpman completions bash)    # enable completions in current session
```

Completes: subcommands, server names (from lockfile), client types (`--client`), and runtimes (`--runtime`). Server names are resolved dynamically at completion time so they stay fresh.

### `why <server>`

Show why a server is installed — source, clients, profiles, env vars.

```sh
mcpman why my-server                 # full provenance output
mcpman why my-server --json          # JSON output for scripting
```

Displays: source (npm/smithery/github/local), resolved URL, version, installed timestamp, which clients have it registered, which named profiles include it, and required env var names. Detects orphaned servers (in client config but not in lockfile) and suggests `mcpman sync --remove`.

---

## Comparison

| Feature | mcpman | Smithery CLI | mcpm.sh |
|---|---|---|---|
| Multi-client support | All 4 clients | Claude only | Limited |
| Lockfile | `mcpman.lock` | None | None |
| Health checks | Runtime + env + process | None | None |
| Encrypted secrets | AES-256 vault | None | None |
| Config sync | Cross-client + `--remove` | None | None |
| Security audit | Trust scoring + auto-fix | None | None |
| CI/CD | GitHub Actions | None | None |
| Auto-update | Version check + notify | None | None |
| Registry sources | npm + Smithery + GitHub | Smithery only | npm only |
| Plugin system | npm-based custom registries | None | None |
| Export/Import | Full config portability | None | None |
| Server testing | JSON-RPC validation | None | None |
| Log streaming | Real-time stdout/stderr | None | None |
| Profiles | Named config switching | None | None |
| Self-upgrade | Built-in CLI updater | None | None |
| Interactive setup | Yes | Partial | No |
| Project-scoped | Yes (`init`) | No | No |
| Server scaffolding | `create` (Node + Python) | None | None |
| Local dev linking | `link` (like npm link) | None | None |
| File watching | `watch` (auto-restart) | None | None |
| Custom registries | `registry` CRUD | None | None |
| Shell completions | bash + zsh + fish | None | None |
| Provenance query | `why` (clients + profiles) | None | None |

---

## Contributing

1. Fork the repo and create a feature branch
2. `npm install` to install dependencies
3. `npm test` to run the test suite
4. Submit a pull request with a clear description

Please follow the existing code style (TypeScript strict, ES modules).

---

## License

MIT
