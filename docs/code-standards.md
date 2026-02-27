# mcpman Code Standards & Guidelines

**Version:** 0.6.0
**Last Updated:** 2026-02-28

## Language & Tooling

**Language:** TypeScript 5.7 (strict mode)
**Runtime:** Node.js ≥20
**Build:** tsup (esbuild-based)
**Linting:** Biome 1.9 (format + lint)
**Testing:** Vitest 4 (unit + integration)

## File Organization

### Naming Conventions

**TypeScript/JavaScript Files:** kebab-case with descriptive names
```
src/
├── commands/audit.ts              # Single command
├── commands/export-command.ts     # Disambiguate "export" keyword
├── core/plugin-health-checker.ts  # Descriptive multi-word
├── utils/config-service.ts        # Service suffix for classes
└── clients/base-client-handler.ts # Handler suffix
```

**Test Files:** Same name + `.test.ts`
```
tests/
├── commands/install.test.ts
├── core/vault-service.test.ts
└── clients/client-detector.test.ts
```

**Directories:** kebab-case grouping by domain
```
src/
├── clients/     # AI client integrations
├── commands/    # CLI subcommands
├── core/        # Business logic
└── utils/       # Helpers
```

### File Size Limit

**Target:** <200 lines per file for maintainability
**Enforcement:** During PR review; exceeding suggests modularization

**Examples of modularization:**
- `vault-service.ts` (encryption) + `vault-helpers.ts` (integration)
- `sync-engine.ts` (core logic) + `config-diff.ts` (detection)
- `registry.ts` (APIs) + `registry-search.ts` (pagination)

## TypeScript Standards

### Type Safety

**Strict Mode:** Always enabled in `tsconfig.json`
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**No `any` Type:** Use explicit types or generics
```typescript
// ✓ Good
function getValue<T>(key: string): T | undefined { }

// ✗ Bad
function getValue(key: string): any { }
```

**Interface Over Type Literal:** For exports and complex shapes
```typescript
// ✓ Good (src/clients/types.ts)
export interface ConfigFile {
  mcpServers: Record<string, ServerConfig>;
}

// ✗ Bad
export type ConfigFile = { mcpServers: Record<string, ServerConfig> };
```

### Imports & Exports

**ES Modules Only** (`.js` extensions required in imports for Node)
```typescript
// ✓ Good
import { vault } from "../core/vault-service.js";
export { createProfile } from "./profile-service.js";

// ✗ Bad (CJS-style)
const { vault } = require("../core/vault-service");
module.exports = { createProfile };
```

**Import Organization:**
1. Built-in modules (node:*, etc.)
2. Third-party packages
3. Relative imports (ascending, then local)

```typescript
import os from "node:os";
import path from "node:path";

import { defineCommand } from "citty";
import pc from "picocolors";

import { readLockfile } from "../core/lockfile.js";
import { logger } from "../utils/logger.js";
```

### Async/Await

**Prefer async/await over .then():**
```typescript
// ✓ Good
async function installServer(name: string): Promise<void> {
  const pkg = await resolver.resolve(name);
  await installer.install(pkg);
}

// ✗ Bad
function installServer(name: string): Promise<void> {
  return resolver.resolve(name).then(pkg => installer.install(pkg));
}
```

**Handle errors explicitly:**
```typescript
// ✓ Good
try {
  await installer.install(pkg);
} catch (error) {
  if (error instanceof NetworkError) {
    logger.error("Network unavailable");
  } else {
    throw error;
  }
}

// ✗ Bad (silent failures)
await installer.install(pkg);
```

## Code Style

### Naming Conventions

**Constants:** UPPER_SNAKE_CASE (exported globals)
```typescript
export const APP_VERSION = "0.6.0";
export const VAULT_TIMEOUT_MS = 900000; // 15min
```

**Variables & Functions:** camelCase
```typescript
const defaultClient = "claude-desktop";
async function syncToClients(lockfile: LockfileData): Promise<void> { }
```

**Classes & Interfaces:** PascalCase
```typescript
class VaultService { }
interface ConfigFile { }
```

**Private Members:** Prefix with `#` (ES2022 private fields)
```typescript
class VaultService {
  #password: string = "";

  async encrypt(data: string): Promise<string> {
    // ...
  }
}
```

### Function Design

**Single Responsibility:** One job per function
```typescript
// ✓ Good (separate concerns)
async function validateServer(server: Server): Promise<ValidationResult> { }
async function installServer(server: Server): Promise<void> { }

// ✗ Bad (mixed concerns)
async function installAndValidate(server: Server): Promise<void> { }
```

**Optional Parameters:** Use object pattern for >2 params
```typescript
// ✓ Good
interface SyncOptions {
  dryRun?: boolean;
  source?: ClientType;
  remove?: boolean;
  yes?: boolean;
}

async function sync(options: SyncOptions): Promise<void> { }

// Usage: sync({ dryRun: true, source: "cursor" })

// ✗ Bad (many positional params)
async function sync(dryRun: boolean, source?: ClientType, remove?: boolean) { }
```

### Error Handling

**Custom Error Classes:** Extend Error for domain-specific errors
```typescript
// ✓ Good (src/core/errors.ts example)
export class NetworkError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = "NetworkError";
  }
}

// Usage
try {
  await fetch(registryUrl);
} catch (error) {
  throw new NetworkError(`Failed to reach ${registryUrl}`, registryUrl);
}
```

**Graceful Degradation:** Handle errors user-facing, don't crash
```typescript
// ✓ Good
try {
  const vault = await vaultService.getSecret("server", "API_KEY");
  return vault || null; // Vault might be locked
} catch (error) {
  logger.warn("Vault unavailable, skipping secrets");
  return null;
}

// ✗ Bad (crashes on missing vault)
const vault = await vaultService.getSecret("server", "API_KEY");
```

## Testing Standards

### Test Structure

**File Organization:** Mirror `src/` structure in `tests/`
```
tests/
├── commands/
│   ├── install.test.ts
│   └── sync.test.ts
├── core/
│   ├── vault-service.test.ts
│   └── lockfile.test.ts
└── clients/
    └── client-detector.test.ts
```

**Test Layout:** Arrange-Act-Assert (AAA)
```typescript
describe("VaultService", () => {
  it("should encrypt and decrypt secrets", async () => {
    // Arrange
    const vault = new VaultService();
    const secret = "my-api-key";

    // Act
    const encrypted = await vault.encrypt(secret);
    const decrypted = await vault.decrypt(encrypted);

    // Assert
    expect(decrypted).toBe(secret);
  });
});
```

### Mocking

**Mock External Dependencies:** Not the code under test
```typescript
// ✓ Good (mock registry, test installer logic)
vi.mock("../core/registry.ts");
const mockRegistry = vi.mocked(registry);
mockRegistry.search.mockResolvedValue([...]);

async function testInstall() {
  await installer.install("my-server");
  expect(installer.writeFiles).toHaveBeenCalled();
}

// ✗ Bad (mocking code under test)
vi.mock("../core/installer.ts");
```

**No Fake Data:** Use real-looking but minimal test fixtures
```typescript
// ✓ Good (minimal, realistic)
const mockServer = {
  name: "@test/server",
  version: "1.0.0",
  runtime: "node",
};

// ✗ Bad (placeholder junk)
const mockServer = { name: "xxx", version: "xxx", runtime: "xxx" };
```

### Coverage Goals

**Target:** >80% line coverage
**Tool:** Vitest built-in coverage

```bash
npm run test:run -- --coverage
```

**Exclude from coverage:**
- Test fixtures (tests/fixtures/)
- Mock data (tests/mocks/)
- CLI spinner/color output

## Documentation Standards

### Code Comments

**When:** Explain WHY, not WHAT (code should be self-documenting)
```typescript
// ✓ Good (WHY)
// Retry up to 3 times as npm API is flaky during publish windows
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  // ...
}

// ✗ Bad (WHAT — code is clear)
// Fetch from URL
const response = await fetch(url);
```

**JSDoc for Public APIs:**
```typescript
/**
 * Encrypt a secret using AES-256-CBC with PBKDF2 key derivation.
 * @param data The plaintext to encrypt
 * @param password The password (will be hashed)
 * @returns Encrypted data (base64 encoded)
 * @throws {VaultError} If encryption fails
 */
export async function encrypt(data: string, password: string): Promise<string> {
  // ...
}
```

### Markdown Documentation

**READMEs:** Brief, with links to detailed docs
```markdown
# mcpman

Install MCP servers across all AI clients.

## Quick Start
...

## Documentation
- [Installation](./docs/installation.md)
- [Architecture](./docs/system-architecture.md)
- [API Reference](./docs/api-reference.md)
```

**CHANGELOG:** Semantic versioning format
```markdown
## [0.6.0] - 2026-02-28

### Added
- `profiles` command for named config snapshots
- `upgrade` command for self-update

### Fixed
- Smithery API now uses correct `qualifiedName` format
```

## Build & Formatting

### Biome Configuration

**Linting & Formatting:**
```bash
npm run lint       # Check for errors
npm run lint:fix   # Auto-fix
```

**Rules (via biome.json):**
- 2-space indentation
- Semicolons required
- Trailing commas in multiline
- No unused variables
- No console.log in production code (warn)

### TypeScript Compilation

**Build:**
```bash
npm run build      # tsup → dist/index.cjs, index.mjs, index.d.ts
npm run dev        # Watch mode
```

**Output Targets:**
- `index.cjs` — CommonJS (npm bin field)
- `index.mjs` — ESM (module field)
- `index.d.ts` — TypeScript definitions

## Git Workflow

### Commit Messages

**Format:** Conventional Commits (type: description)
```
feat: add profiles command for named config snapshots
fix: resolve Smithery API pagination issue
docs: update system architecture for v0.6.0
test: add integration test for sync --remove
chore: update dependencies
```

**Rules:**
- Lowercase, imperative mood ("add", not "added")
- <50 characters for subject
- Link issue if relevant: "fix: #42"
- No AI references (e.g., "generated by Claude")

### Before Push

**Checklist:**
- [ ] Lint passes: `npm run lint:fix`
- [ ] Tests pass: `npm run test:run`
- [ ] Build succeeds: `npm run build`
- [ ] No console.log in production code
- [ ] Comments explain WHY
- [ ] Commit message is clear

## CI/CD Standards

### GitHub Actions

**Test Job:** Run on every push/PR
```yaml
npm install
npm run lint
npm run test:run
```

**Publish Job:** On git tag (e.g., `v0.6.0`)
```yaml
npm run build
npm publish
```

**Requirements:**
- Node 20 and 22 tested
- 0 critical lint errors
- All tests passing

## Performance Guidelines

### Async Operations

**Parallelize when possible:**
```typescript
// ✓ Good (parallel)
const results = await Promise.all([
  checkClient("claude-desktop"),
  checkClient("cursor"),
  checkClient("vscode"),
  checkClient("windsurf"),
]);

// ✗ Bad (sequential)
const r1 = await checkClient("claude-desktop");
const r2 = await checkClient("cursor");
// ...
```

**Lazy Load Heavy Modules:**
```typescript
// ✓ Good (import inside if branch)
if (options.exportVault) {
  const vaultModule = await import("../core/vault-service.js");
  // ...
}

// ✗ Bad (always import)
import { vaultService } from "../core/vault-service.js";
```

### Caching

**Cache External API Calls:**
```typescript
// Example: 24h cache for npm version checks
const VERSION_CACHE_TTL = 24 * 60 * 60 * 1000;

async function checkForUpdates(): Promise<Version> {
  const cached = cache.get("npm-latest-version");
  if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
    return cached.version;
  }

  const version = await fetchNpmLatest();
  cache.set("npm-latest-version", { version, timestamp: Date.now() });
  return version;
}
```

## Security Guidelines

### Secrets Handling

**Never log secrets:**
```typescript
// ✓ Good
const apiKey = await vault.getSecret("server", "API_KEY");
logger.info(`Loaded secret for ${server}`); // No key content

// ✗ Bad (exposes secret in logs)
logger.info(`Loaded API_KEY=${apiKey}`);
```

**Clear sensitive data after use:**
```typescript
// ✓ Good (crypto.timingSafeEqual)
import crypto from "node:crypto";
const match = crypto.timingSafeEqual(
  Buffer.from(password),
  Buffer.from(expectedPassword)
);

// ✗ Bad (timing attack vulnerability)
const match = password === expectedPassword;
```

### Dependency Management

**Lock Dependencies:** Commit package-lock.json
**Audit Regularly:** `npm audit`
**Pin Major Versions:** Avoid `^` for critical deps

```json
{
  "dependencies": {
    "citty": "0.1.6",
    "@clack/prompts": "0.9.1"
  }
}
```

## Common Patterns

### CLI Command Definition
```typescript
import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "install",
    description: "Install an MCP server",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name or URL",
      required: true,
    },
    client: {
      type: "string",
      description: "Target client",
      alias: "c",
    },
  },
  async run({ args }) {
    const name = args.server as string;
    const client = args.client as string | undefined;
    // ... implement
  },
});
```

### Service Class Pattern
```typescript
export class MyService {
  #config: Config;

  constructor(config: Config) {
    this.#config = config;
  }

  async doSomething(): Promise<void> {
    // Use this.#config
  }
}
```

### Error Throwing
```typescript
if (!file) {
  throw new FileNotFoundError(`File not found: ${path}`);
}

if (!isValidVersion(version)) {
  throw new ValidationError(`Invalid version: ${version}`);
}
```

## Review Checklist

Before submitting PR:
- [ ] Code follows naming/style conventions
- [ ] File under 200 lines (or modularized)
- [ ] TypeScript strict mode passes
- [ ] Tests added for new logic
- [ ] Comments explain WHY
- [ ] No console.log (use logger)
- [ ] Error handling comprehensive
- [ ] Biome lint passes
- [ ] All tests passing
- [ ] Commit messages conventional
