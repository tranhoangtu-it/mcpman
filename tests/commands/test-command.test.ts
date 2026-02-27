/**
 * test-command.test.ts
 * Tests for `mcpman test` — MCP server connectivity validation.
 * Mocks lockfile, vault-service, and mcp-tester.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LockfileData } from "../../src/core/lockfile.js";
import type { McpTestResult } from "../../src/core/mcp-tester.js";

// ── Mock lockfile ──────────────────────────────────────────────────────────────

vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: vi.fn(),
  resolveLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
  findLockfile: vi.fn().mockReturnValue(null),
  getGlobalLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
}));

// ── Mock vault-service ─────────────────────────────────────────────────────────

vi.mock("../../src/core/vault-service.js", () => ({
  getMasterPassword: vi.fn().mockResolvedValue("pass"),
  getSecretsForServer: vi.fn().mockReturnValue({}),
  listSecrets: vi.fn().mockReturnValue([]),
  clearPasswordCache: vi.fn(),
  getVaultPath: vi.fn().mockReturnValue("/tmp/vault.enc"),
}));

// ── Mock mcp-tester ────────────────────────────────────────────────────────────

vi.mock("../../src/core/mcp-tester.js", () => ({
  testMcpServer: vi.fn(),
}));

// ── Mock server-resolver (parseEnvFlags) ──────────────────────────────────────

vi.mock("../../src/core/server-resolver.js", () => ({
  parseEnvFlags: vi.fn().mockReturnValue({}),
  detectSource: vi.fn(),
}));

import { readLockfile } from "../../src/core/lockfile.js";
import { testMcpServer } from "../../src/core/mcp-tester.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLockEntry(overrides = {}): LockfileData["servers"][string] {
  return {
    version: "1.0.0",
    source: "npm",
    resolved: "",
    integrity: "",
    runtime: "node",
    command: "npx",
    args: ["-y", "my-server"],
    envVars: [],
    installedAt: "2024-01-01T00:00:00.000Z",
    clients: ["claude-desktop"],
    ...overrides,
  };
}

function makeLockfile(servers: LockfileData["servers"] = {}): LockfileData {
  return { lockfileVersion: 1, servers };
}

function makeTestResult(overrides: Partial<McpTestResult> = {}): McpTestResult {
  return {
    serverName: "my-server",
    passed: true,
    initializeOk: true,
    toolsListOk: true,
    tools: [],
    responseTimeMs: 42,
    ...overrides,
  };
}

async function runTestCommand(
  serverArg?: string,
  allFlag = false,
): Promise<void> {
  const mod = await import("../../src/commands/test-command.js");
  const cmd = mod.default as unknown as {
    run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
  };
  await cmd.run({ args: { server: serverArg, all: allFlag } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
  });
});

// ── No server specified ────────────────────────────────────────────────────────

describe("test command — no server specified", () => {
  it("exits with code 1 when neither server nor --all provided", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile());

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runTestCommand()).rejects.toThrow("process.exit(1)");

    errorSpy.mockRestore();
  });
});

// ── Server not found ───────────────────────────────────────────────────────────

describe("test command — server not in lockfile", () => {
  it("reports failed for server not installed", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({}));
    (testMcpServer as ReturnType<typeof vi.fn>).mockResolvedValue(makeTestResult());

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Server not in lockfile → failed count > 0 → process.exit(1)
    await expect(runTestCommand("missing-server")).rejects.toThrow("process.exit(1)");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/missing-server/);
    expect(output).toMatch(/not installed/i);

    logSpy.mockRestore();
  });
});

// ── Passed result ──────────────────────────────────────────────────────────────

describe("test command — passed result", () => {
  it("prints passed line with response time for a passing server", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "my-server": makeLockEntry() }),
    );
    (testMcpServer as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTestResult({ passed: true, responseTimeMs: 123 }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTestCommand("my-server");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/my-server/);
    expect(output).toMatch(/123ms/);

    logSpy.mockRestore();
  });

  it("lists discovered tools when server returns tools", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "tool-server": makeLockEntry() }),
    );
    (testMcpServer as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTestResult({
        serverName: "tool-server",
        passed: true,
        tools: ["read_file", "write_file"],
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTestCommand("tool-server");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/read_file/);
    expect(output).toMatch(/write_file/);

    logSpy.mockRestore();
  });
});

// ── Failed result ──────────────────────────────────────────────────────────────

describe("test command — failed result", () => {
  it("exits with code 1 and shows failure details", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "bad-server": makeLockEntry() }),
    );
    (testMcpServer as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTestResult({
        serverName: "bad-server",
        passed: false,
        initializeOk: false,
        toolsListOk: false,
        error: "Spawn error: command not found",
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTestCommand("bad-server")).rejects.toThrow("process.exit(1)");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/bad-server/);
    expect(output).toMatch(/command not found/i);

    logSpy.mockRestore();
  });
});

// ── --all flag ─────────────────────────────────────────────────────────────────

describe("test command — --all flag", () => {
  it("tests all servers in lockfile", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({
        "server-a": makeLockEntry(),
        "server-b": makeLockEntry(),
      }),
    );
    (testMcpServer as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTestResult({ passed: true }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runTestCommand(undefined, true);

    // testMcpServer called once per server
    expect(testMcpServer).toHaveBeenCalledTimes(2);

    logSpy.mockRestore();
  });

  it("exits code 1 when any server fails with --all", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({
        "ok-server": makeLockEntry(),
        "fail-server": makeLockEntry(),
      }),
    );
    (testMcpServer as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeTestResult({ passed: true }))
      .mockResolvedValueOnce(makeTestResult({ passed: false, error: "timeout" }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runTestCommand(undefined, true)).rejects.toThrow("process.exit(1)");

    logSpy.mockRestore();
  });
});
