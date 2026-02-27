/**
 * run-command.test.ts
 * Tests for the `mcpman run` command: env merge, vault injection, error paths.
 *
 * Strategy: intercept `spawn` to capture args + immediately emit "close" synchronously,
 * and stub `process.exit` to throw so the async run() resolves cleanly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LockfileData } from "../../src/core/lockfile.js";

// ── Captured state shared across tests ───────────────────────────────────────

/** Stores the args from the most recent spawn() call. */
let capturedSpawnArgs: { cmd: string; args: string[]; env: Record<string, string> } | null = null;

// ── Mock child_process ─────────────────────────────────────────────────────────
// Child emits "close" synchronously so the promise resolves immediately,
// then process.exit (mocked below) is called inside the test scope.

vi.mock("node:child_process", () => ({
  spawn: vi.fn((cmd: string, args: string[], opts: { env?: Record<string, string> }) => {
    capturedSpawnArgs = { cmd, args, env: opts.env ?? {} };
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const child = {
      killed: false,
      kill: vi.fn(),
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        // Fire "close" synchronously with code 0 so the run() promise resolves
        if (event === "close") cb(0);
      }),
    };
    return child;
  }),
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
  getMasterPassword: vi.fn().mockResolvedValue("masterPass1234"),
  getSecretsForServer: vi.fn().mockReturnValue({}),
  listSecrets: vi.fn().mockReturnValue([]),
  clearPasswordCache: vi.fn(),
  getVaultPath: vi.fn().mockReturnValue("/tmp/test-vault.enc"),
}));

// ── Mock server-resolver (parseEnvFlags) ──────────────────────────────────────

vi.mock("../../src/core/server-resolver.js", () => ({
  parseEnvFlags: vi.fn((flags: string | string[] | undefined) => {
    if (!flags) return {};
    const arr = Array.isArray(flags) ? flags : [flags];
    const result: Record<string, string> = {};
    for (const f of arr) {
      const idx = f.indexOf("=");
      if (idx > 0) result[f.slice(0, idx)] = f.slice(idx + 1);
    }
    return result;
  }),
  detectSource: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { readLockfile } from "../../src/core/lockfile.js";
import {
  getMasterPassword,
  getSecretsForServer,
  listSecrets,
} from "../../src/core/vault-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLockEntry(overrides: Partial<LockfileData["servers"][string]> = {}): LockfileData["servers"][string] {
  return {
    version: "1.0.0",
    source: "npm",
    resolved: "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",
    integrity: "sha512-abc",
    runtime: "node",
    command: "npx",
    args: ["-y", "my-server@1.0.0"],
    envVars: [],
    installedAt: "2024-01-01T00:00:00.000Z",
    clients: ["claude-desktop"],
    ...overrides,
  };
}

function makeLockfile(servers: LockfileData["servers"] = {}): LockfileData {
  return { lockfileVersion: 1, servers };
}

/**
 * Run the command's run() handler.
 * process.exit is mocked to throw so run() doesn't actually exit the process.
 */
async function runCommand(serverArg: string, envArg?: string | string[]): Promise<void> {
  // Reset captured state
  capturedSpawnArgs = null;

  const mod = await import("../../src/commands/run.js");
  const cmd = mod.default as unknown as {
    run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
  };
  await cmd.run({ args: { server: serverArg, env: envArg } });
}

// ── Test setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  capturedSpawnArgs = null;

  // Mock process.exit to prevent actually exiting — throw a recognizable error
  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
  });

  // Default vault state: no entries
  (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({});
  (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
});

// ── Tests: server not installed ────────────────────────────────────────────────

describe("run command — server not installed", () => {
  it("exits with code 1 and prints error when server not in lockfile", async () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({}));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runCommand("missing-server")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/missing-server/);

    errorSpy.mockRestore();
  });
});

// ── Tests: basic spawn ─────────────────────────────────────────────────────────

describe("run command — basic spawn", () => {
  it("spawns child with correct command and args from lockfile", async () => {
    const entry = makeLockEntry({ command: "npx", args: ["-y", "my-server@1.0.0"] });
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));

    await expect(runCommand("my-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.cmd).toBe("npx");
    expect(capturedSpawnArgs?.args).toEqual(["-y", "my-server@1.0.0"]);
  });

  it("uses stdio: inherit for child process", async () => {
    const { spawn } = await import("node:child_process");
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));

    await expect(runCommand("my-server")).rejects.toThrow("process.exit");

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: "inherit" })
    );
  });
});

// ── Tests: env merge ───────────────────────────────────────────────────────────

describe("run command — env merge", () => {
  it("merges lockfile envVars into spawned env", async () => {
    const entry = makeLockEntry({ envVars: ["DB_HOST=localhost", "DB_PORT=5432"] });
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));

    await expect(runCommand("my-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.env.DB_HOST).toBe("localhost");
    expect(capturedSpawnArgs?.env.DB_PORT).toBe("5432");
  });

  it("merges vault secrets into spawned env", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "fs-server": entry }));
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([{ server: "fs-server", keys: ["API_KEY"] }]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({ API_KEY: "secret-from-vault" });

    await expect(runCommand("fs-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.env.API_KEY).toBe("secret-from-vault");
  });

  it("--env flags override vault secrets (highest priority)", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([{ server: "my-server", keys: ["API_KEY"] }]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({ API_KEY: "vault-value" });

    await expect(runCommand("my-server", "API_KEY=cli-override")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.env.API_KEY).toBe("cli-override");
  });

  it("merges multiple --env flags", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));

    await expect(runCommand("my-server", ["DEBUG=true", "LOG_LEVEL=verbose"])).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs?.env.DEBUG).toBe("true");
    expect(capturedSpawnArgs?.env.LOG_LEVEL).toBe("verbose");
  });
});

// ── Tests: vault error handling ────────────────────────────────────────────────

describe("run command — vault error handling", () => {
  it("continues without secrets when vault throws, prints warning", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([{ server: "my-server", keys: ["SECRET"] }]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("vault corrupt"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Still spawns despite vault failure
    await expect(runCommand("my-server")).rejects.toThrow("process.exit");

    expect(capturedSpawnArgs).not.toBeNull();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).toLowerCase().includes("vault"))).toBe(true);

    warnSpy.mockRestore();
  });

  it("skips vault prompt entirely when no vault entries for server", async () => {
    const entry = makeLockEntry();
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile({ "my-server": entry }));
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]); // no secrets stored

    await expect(runCommand("my-server")).rejects.toThrow("process.exit");

    // getMasterPassword should NOT be called — no reason to prompt
    expect(getMasterPassword).not.toHaveBeenCalled();
    expect(capturedSpawnArgs).not.toBeNull();
  });
});
