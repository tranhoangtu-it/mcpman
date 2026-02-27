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
| Interactive setup | Yes | Partial | No |
| Project-scoped | Yes (`init`) | No | No |

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
