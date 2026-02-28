# mcpman Design Guidelines

**Version:** 1.0.0
**Last Updated:** 2026-02-28

## CLI Design Philosophy

mcpman follows the Unix CLI philosophy: do one thing well, compose with other tools, and be scriptable. Every design decision is evaluated against three questions:

1. Can a new user understand this in under 2 minutes?
2. Can a CI/CD pipeline consume this output without parsing prose?
3. Is the default behavior safe (read-only or dry-run where destructive)?

## Command Naming Conventions

### Verb-First Naming

Commands use imperative verbs that describe the action, not the subject:

| Pattern | Example | Avoid |
|---------|---------|-------|
| `<verb>` for single-noun domains | `install`, `search`, `audit` | `packages-install` |
| `<noun>` for multi-subcommand groups | `profiles`, `plugin`, `group` | `manage-profiles` |
| `<verb>-command.ts` for reserved words | `export-command.ts`, `import-command.ts` | `export.ts` (JS keyword) |

### Subcommand Groups

When a command has multiple actions, use positional subcommands:
```bash
mcpman profiles create <name>
mcpman profiles list
mcpman profiles switch <name>
mcpman profiles delete <name>
```

Not flags: `mcpman profiles --create <name>` — this pattern is harder to discover.

### Flag Conventions

| Pattern | Usage | Example |
|---------|-------|---------|
| `--dry-run` | Preview without applying | `sync --dry-run` |
| `--yes` / `-y` | Skip confirmation prompts (CI-safe) | `audit --fix --yes` |
| `--json` | Machine-readable output | `info --json`, `audit --json` |
| `--all` | Expand scope to everything | `test --all`, `search --all` |
| `--check` | Read-only variant of mutating command | `upgrade --check` |
| `--client <name>` | Restrict to specific AI client | `install --client cursor` |

## Output Formatting Standards

### Human Output (default)

Use consistent visual hierarchy:

```
mcpman install @modelcontextprotocol/server-filesystem

  Resolving @modelcontextprotocol/server-filesystem...
  Downloading v1.2.0...
  Installing...

  Registered in 4 clients:
    Claude Desktop    ~/Library/Application Support/Claude/...
    Cursor            ~/Library/Application Support/Cursor/...
    VS Code           ~/Library/Application Support/Code/...
    Windsurf          ~/Library/Application Support/Windsurf/...

  server-filesystem v1.2.0 installed successfully
```

Rules:
- 2-space indent for sub-items
- Spinner for operations >500ms (nanospinner)
- Green for success, yellow for warnings, red for errors (picocolors)
- Blank line before and after major sections
- Never print raw stack traces to users

### JSON Output (`--json` flag)

All commands that produce data support `--json`:
```json
{
  "success": true,
  "server": "server-filesystem",
  "version": "1.2.0",
  "clients": ["claude-desktop", "cursor", "vscode", "windsurf"]
}
```

Rules:
- Always include `"success": true | false`
- On error: `{ "success": false, "error": "message" }` with non-zero exit code
- No color codes in JSON output
- Stable key names across versions (breaking key rename = major version bump)

### Table Output

Use tables for list data. Consistent column ordering: name → version → status → details.

```
Server                    Version   Clients         Trust
─────────────────────────────────────────────────────────
server-filesystem         1.2.0     4/4             92
server-github             0.5.1     2/4             78
```

## Interactive Prompts

Use `@clack/prompts` for all interactive input. Never use `readline` directly.

### Prompt Patterns

**Confirmation before destructive actions:**
```typescript
const confirmed = await confirm({
  message: `Remove server-filesystem from all clients?`,
});
if (!confirmed) process.exit(0);
```

**Always provide `--yes` to skip:**
```bash
mcpman remove server-filesystem --yes
```

**Env var collection during install:**
- Prompt only for vars marked `required: true` in server manifest
- Pre-fill from vault if secret exists
- Offer to save new values to vault after successful install

## Error Handling Patterns

### User-Facing Errors

Format: `[context] what went wrong — what to do`

```
Error: Cannot reach npm registry — check your internet connection
Error: Vault is locked — run `mcpman secrets unlock` first
Error: Client not found: windsurf — is Windsurf installed?
```

Never expose:
- Raw Node.js stack traces
- Internal file paths unrelated to user data
- Cryptographic key material or vault contents

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (config, validation, user abort) |
| 2 | Network error (registry, OSV API unreachable) |
| 3 | Auth error (vault locked, permission denied) |

### Graceful Degradation

Skip unavailable components rather than aborting entirely:
- Client not installed → skip that client, continue with others
- Vault locked and user declines → skip secret injection, continue install
- Plugin registry unreachable → skip plugin results, return core results

## Security Design Principles

1. **Secrets never in plaintext** — vault-only storage, never written to lockfile or client configs
2. **Default to safe** — `--dry-run` where operations are destructive or irreversible
3. **Trust before install** — compute trust score (0–100) and surface it during `info` and `install`
4. **Audit trail** — all installs/removes recorded in history-service for `replay` and `status`
5. **No network on `--offline`** — commands must work without registry access where possible

## Extensibility Design

### Plugin Interface

Plugins are npm packages that export a default `McpmanPlugin` object:
```typescript
interface McpmanPlugin {
  name: string;       // human-readable plugin name
  prefix: string;     // e.g. "ollama" → handles "ollama:*" installs
  resolve(server: string, options: ResolveOptions): Promise<ResolvedServer>;
}
```

### Adding a New Command

1. Create `src/commands/<verb>.ts` (or `<noun>.ts` for subcommand group)
2. Create `src/core/<verb>-service.ts` for business logic
3. Register command in `src/index.ts`
4. Add test at `tests/commands/<verb>-command.test.ts`
5. Update `docs/codebase-summary.md` command count

### Adding a New Client

1. Extend `ClientType` in `src/clients/types.ts`
2. Create `src/clients/<client-name>.ts` extending `BaseClientHandler`
3. Register in `client-detector.ts`
4. Add platform config paths for macOS/Windows/Linux
