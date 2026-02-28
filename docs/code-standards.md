# mcpman Code Standards & Guidelines

**Version:** 1.0.0
**Last Updated:** 2026-02-28

## Language & Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 5.7 | Language (strict mode) |
| Node.js | ≥20 | Runtime |
| tsup | 8 | Build (esbuild-based) |
| Biome | 1.9 | Format + lint |
| Vitest | 4 | Unit + integration tests |

## File Organization

**TypeScript files:** kebab-case with descriptive names
```
src/commands/export-command.ts       # "export" is a reserved keyword
src/core/installer-vault-helpers.ts  # descriptive multi-word
src/core/plugin-health-checker.ts
src/clients/base-client-handler.ts
```

**Test files:** same name + `.test.ts`

**Directories:** kebab-case, grouped by domain (`clients/`, `commands/`, `core/`, `utils/`)

**File size limit:** <200 lines per file. Exceeding triggers modularization.

Modularization examples in this codebase:
- `vault-service.ts` + `installer-vault-helpers.ts` (encryption vs install integration)
- `sync-engine.ts` + `config-diff.ts` + `config-differ.ts` (sync vs detection vs utilities)
- `registry.ts` + `registry-search.ts` + `registry-manager.ts` (API vs pagination vs custom)

## TypeScript Standards

**Strict mode always enabled:**
```json
{ "compilerOptions": { "strict": true, "noImplicitAny": true, "noUncheckedIndexedAccess": true } }
```

No `any` type — use explicit types or generics. Interface over type alias for exports.

**ES Modules only** (`.js` extensions required in imports):
```typescript
import os from "node:os";
import { defineCommand } from "citty";
import { readLockfile } from "../core/lockfile.js";
import { logger } from "../utils/logger.js";
```

Import order: built-ins → third-party → relative.

**Prefer `async/await`, handle errors explicitly:**
```typescript
try {
  await installer.install(pkg);
} catch (error) {
  if (error instanceof NetworkError) logger.error("Network unavailable");
  else throw error;
}
```

## Naming Conventions

| Scope | Convention | Example |
|-------|-----------|---------|
| Exported constants | `UPPER_SNAKE_CASE` | `APP_VERSION`, `VAULT_TIMEOUT_MS` |
| Variables & functions | `camelCase` | `defaultClient`, `applySyncActions()` |
| Classes & interfaces | `PascalCase` | `EncryptedEntry`, `ConfigFile` |
| Private members | `#field` (ES2022) | `#password: string` |

## Function Design

Single responsibility per function. Object pattern for >2 parameters:
```typescript
interface SyncOptions { dryRun?: boolean; source?: ClientType; remove?: boolean; yes?: boolean; }
async function sync(options: SyncOptions): Promise<void> {}
```

## Error Handling

Custom error classes extend `Error`. Graceful degradation — never crash on non-critical failures:
```typescript
try {
  return await vaultService.getSecret("server", "API_KEY") ?? null;
} catch {
  logger.warn("Vault unavailable, skipping secrets");
  return null;
}
```

## CLI Command Pattern

```typescript
export default defineCommand({
  meta: { name: "install", description: "Install an MCP server" },
  args: {
    server: { type: "positional", description: "Server name or URL", required: true },
    client: { type: "string", description: "Target client", alias: "c" },
  },
  async run({ args }) { /* implement */ },
});
```

## Testing Standards

Structure mirrors `src/` in `tests/`. Use Arrange-Act-Assert pattern.

Mock external dependencies, not the code under test:
```typescript
vi.mock("../core/registry.ts");
vi.mocked(registry).search.mockResolvedValue([...]);
```

Use realistic minimal fixtures (no placeholder junk like `name: "xxx"`).

**Coverage target:** >80% via `npm run test:run -- --coverage`.

## Build & Formatting

```bash
npm run build      # tsup → dist/index.cjs, index.mjs, index.d.ts
npm run lint:fix   # biome check --write
```

**Biome rules:** 2-space indent, semicolons, trailing commas, no unused vars, no `console.log`.

**Output targets:** `index.cjs` (npm bin — required CJS), `index.mjs` (ESM), `index.d.ts` (types).

## Git Workflow

**Conventional commits:**
```
feat: add profiles command for named config snapshots
fix: resolve Smithery API pagination with qualifiedName format
docs: update system architecture for v1.0.0
chore: bump version to 1.0.0
```

Rules: lowercase, imperative mood, <50 chars subject, no AI references.

## Security Guidelines

- Never log secrets — only log server name, not key content
- Use `crypto.timingSafeEqual` for password comparison
- Commit `package-lock.json`; pin major versions for critical deps

## Performance Guidelines

Parallelize client operations with `Promise.all`. Cache external API calls (24h TTL for version checks). Lazy-load heavy modules when only conditionally needed.

## Before Push Checklist

- [ ] `npm run lint:fix` passes
- [ ] `npm run test:run` passes
- [ ] `npm run build` succeeds
- [ ] No `console.log` in production code
- [ ] Comments explain WHY, not WHAT
- [ ] File under 200 lines (or split)
- [ ] Tests added for new logic
- [ ] Commit message is conventional
