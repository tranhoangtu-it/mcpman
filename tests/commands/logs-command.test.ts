/**
 * logs-command.test.ts
 * Tests for `mcpman logs` — stdout/stderr streaming from an MCP server.
 * Mocks lockfile, vault-service, and spawn.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LockfileData } from "../../src/core/lockfile.js";

// ── Captured spawn state ───────────────────────────────────────────────────────

let capturedSpawnArgs: {
  cmd: string;
  args: string[];
  env: Record<string, string>;
} | null = null;

// ── Mock child_process ─────────────────────────────────────────────────────────
// Emits "close" synchronously so the run() promise settles in tests.

vi.mock("node:child_process", () => ({
  spawn: vi.fn(
    (cmd: string, args: string[], opts: { env?: Record<string, string> }) => {
      capturedSpawnArgs = { cmd, args, env: opts.env ?? {} };

      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
      const child = {
        killed: false,
        kill: vi.fn(),
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
          // Fire "close" synchronously with code 0 so the promise settles
          if (event === "close") cb(0);
        }),
      };
      return child;
    },
  ),
}));

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

// ── Mock server-resolver ───────────────────────────────────────────────────────

vi.mock("../../src/core/server-resolver.js", () => ({
  parseEnvFlags: vi.fn().mockReturnValue({}),
  detectSource: vi.fn(),
}));

import { readLockfile } from "../../src/core/lockfile.js";
import { listSecrets, getMasterPassword, getSecretsForServer } from "../../src/core/vault-service.js";
import { spawn } from "node:child_process";

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

async function runLogs(serverArg: string): Promise<void> {
  capturedSpawnArgs = null;
  const mod = await import("../../src/commands/logs.js");
  const cmd = mod.default as unknown as {
    run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
  };
  await cmd.run({ args: { server: serverArg, follow: true } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedSpawnArgs = null;

  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: { PATH: "/usr/bin" },
    stdout: process.stdout,
    stderr: process.stderr,
  });

  (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({});
  (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("pass");
});

// ── Server not installed ───────────────────────────────────────────────────────

describe("logs command — server not installed", () => {
  it("exits with code 1 when server is not in lockfile", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({}));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runLogs("ghost-server")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/ghost-server/);

    errorSpy.mockRestore();
  });
});

// ── Spawn args ─────────────────────────────────────────────────────────────────

describe("logs command — spawn", () => {
  it("spawns with correct command and args from lockfile", async () => {
    const entry = makeLockEntry({ command: "node", args: ["server.js"] });
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "my-server": entry }),
    );

    // close(0) triggers process.exit(0)
    await expect(runLogs("my-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.cmd).toBe("node");
    expect(capturedSpawnArgs?.args).toEqual(["server.js"]);
  });

  it("uses pipe stdio for stdout and stderr capture", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "my-server": entry }),
    );

    await expect(runLogs("my-server")).rejects.toThrow("process.exit");

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("includes process.env in spawned env", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "my-server": entry }),
    );

    await expect(runLogs("my-server")).rejects.toThrow("process.exit");

    // PATH from stubbed process.env should be present
    expect(capturedSpawnArgs?.env).toHaveProperty("PATH");
  });

  it("merges vault secrets into spawned env", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "secret-server": entry }),
    );
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "secret-server", keys: ["API_KEY"] },
    ]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("pass");
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({
      API_KEY: "top-secret",
    });

    await expect(runLogs("secret-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.env.API_KEY).toBe("top-secret");
  });
});
