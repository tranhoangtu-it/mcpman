/**
 * status-checker.test.ts
 * Unit tests for live MCP server process status checking.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: vi.fn(),
  resolveLockfilePath: vi.fn(() => "/fake/mcpman.lock"),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

import { execSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readLockfile } from "../../src/core/lockfile.js";
import {
  getServerStatuses,
  isProcessRunning,
  probeServer,
} from "../../src/core/status-checker.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockEntry() {
  return {
    version: "1.0.0",
    source: "npm" as const,
    command: "node",
    args: ["server.js"],
    resolved: "",
    integrity: "",
    runtime: "node" as const,
    envVars: [],
    installedAt: new Date().toISOString(),
    clients: [],
  };
}

function makeFakeChild(opts: {
  exitCode?: number;
  errorMessage?: string;
  stdoutData?: string;
} = {}): EventEmitter & { stdin: EventEmitter & { write: ReturnType<typeof vi.fn> }; stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as ReturnType<typeof makeFakeChild>;
  child.stdin = Object.assign(new EventEmitter(), { write: vi.fn() });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  setImmediate(() => {
    if (opts.errorMessage) {
      child.emit("error", new Error(opts.errorMessage));
    } else if (opts.stdoutData) {
      child.stdout.emit("data", Buffer.from(opts.stdoutData));
    } else {
      child.emit("exit", opts.exitCode ?? 1);
    }
  });

  return child;
}

// ── isProcessRunning ──────────────────────────────────────────────────────────

describe("isProcessRunning", () => {
  afterEach(() => vi.mocked(execSync).mockReset());

  it("returns true when command appears in ps output", () => {
    vi.mocked(execSync).mockReturnValue("user  123  0.0  node server.js\n" as unknown as Buffer);
    expect(isProcessRunning("node")).toBe(true);
  });

  it("returns false when command not in ps output", () => {
    vi.mocked(execSync).mockReturnValue("user  123  0.0  python app.py\n" as unknown as Buffer);
    expect(isProcessRunning("node")).toBe(false);
  });

  it("returns false when execSync throws", () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("ps failed"); });
    expect(isProcessRunning("node")).toBe(false);
  });
});

// ── probeServer ───────────────────────────────────────────────────────────────

describe("probeServer", () => {
  beforeEach(() => vi.mocked(spawn).mockReset());

  it("returns alive=false when process errors", async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeChild({ errorMessage: "ENOENT" }) as ReturnType<typeof spawn>);
    const result = await probeServer("test-srv", makeMockEntry(), 500);
    expect(result.alive).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("returns alive=false when process exits with non-zero", async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeChild({ exitCode: 1 }) as ReturnType<typeof spawn>);
    const result = await probeServer("test-srv", makeMockEntry(), 500);
    expect(result.alive).toBe(false);
  });

  it("returns alive=true when valid JSON-RPC response received", async () => {
    const response = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    vi.mocked(spawn).mockReturnValue(makeFakeChild({ stdoutData: `${response}\n` }) as ReturnType<typeof spawn>);
    const result = await probeServer("test-srv", makeMockEntry(), 1000);
    expect(result.alive).toBe(true);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns name in result", async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeChild({ exitCode: 1 }) as ReturnType<typeof spawn>);
    const result = await probeServer("my-server", makeMockEntry(), 500);
    expect(result.name).toBe("my-server");
  });
});

// ── getServerStatuses ─────────────────────────────────────────────────────────

describe("getServerStatuses", () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(readLockfile).mockReturnValue({ lockfileVersion: 1, servers: {} });
  });

  it("returns empty array when lockfile has no servers", async () => {
    const statuses = await getServerStatuses();
    expect(statuses).toEqual([]);
  });

  it("returns error status for unknown server name", async () => {
    vi.mocked(readLockfile).mockReturnValue({ lockfileVersion: 1, servers: {} });
    const statuses = await getServerStatuses("unknown-server");
    expect(statuses[0].alive).toBe(false);
    expect(statuses[0].error).toContain("not in lockfile");
  });

  it("probes each server in lockfile", async () => {
    vi.mocked(readLockfile).mockReturnValue({
      lockfileVersion: 1,
      servers: {
        "srv-a": makeMockEntry(),
        "srv-b": makeMockEntry(),
      },
    });
    vi.mocked(spawn).mockReturnValue(makeFakeChild({ exitCode: 1 }) as ReturnType<typeof spawn>);
    const statuses = await getServerStatuses();
    expect(statuses).toHaveLength(2);
  });
});
