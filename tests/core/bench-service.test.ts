/**
 * bench-service.test.ts
 * Tests for MCP server latency benchmarking.
 * Mocks child_process.spawn to simulate fast/slow/failing servers.
 */

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock child_process BEFORE imports ─────────────────────────────────────────

type SpawnCallback = (event: string, cb: (...a: unknown[]) => void) => void;

interface MockChild {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: SpawnCallback;
  kill: ReturnType<typeof vi.fn>;
}

let spawnImpl: (cmd: string, args: string[], opts: unknown) => MockChild;

vi.mock("node:child_process", () => ({
  spawn: vi.fn((cmd: string, args: string[], opts: unknown) => spawnImpl(cmd, args, opts)),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { benchServer } from "../../src/core/bench-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a mock child that immediately responds to initialize with id=1 */
function makeRespondingChild(delayMs = 0): MockChild {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const exitListeners: Array<(code: number) => void> = [];

  const child: MockChild = {
    stdin: { write: vi.fn() },
    stdout,
    stderr,
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      if (event === "exit") exitListeners.push(cb as (code: number) => void);
    }),
  };

  // Emit initialize response after delayMs
  setTimeout(() => {
    const response = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    stdout.emit("data", Buffer.from(`${response}\n`));
  }, delayMs);

  return child;
}

/** Creates a mock child that exits immediately with an error code */
function makeFailingChild(code = 1): MockChild {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const exitListeners: Array<(code: number) => void> = [];

  const child: MockChild = {
    stdin: { write: vi.fn() },
    stdout,
    stderr,
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      if (event === "exit") {
        exitListeners.push(cb as (code: number) => void);
        // Fire exit on next tick
        setTimeout(() => (cb as (c: number) => void)(code), 0);
      }
    }),
  };

  return child;
}

/** Creates a mock child that emits a spawn error */
function makeErrorChild(message: string): MockChild {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const child: MockChild = {
    stdin: { write: vi.fn() },
    stdout,
    stderr,
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      if (event === "error") {
        setTimeout(() => (cb as (e: Error) => void)(new Error(message)), 0);
      }
    }),
  };

  return child;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("benchServer — successful runs", () => {
  it("returns correct run count", async () => {
    spawnImpl = () => makeRespondingChild(10);
    const result = await benchServer("node", ["server.js"], {}, 3, 5000);
    expect(result.runs).toBe(3);
    expect(result.allTimes).toHaveLength(3);
    expect(result.error).toBeUndefined();
  });

  it("min <= avg <= max", async () => {
    spawnImpl = () => makeRespondingChild(5);
    const result = await benchServer("node", ["server.js"], {}, 3, 5000);
    expect(result.min).toBeLessThanOrEqual(result.avg);
    expect(result.avg).toBeLessThanOrEqual(result.max);
  });

  it("all times are positive", async () => {
    spawnImpl = () => makeRespondingChild(1);
    const result = await benchServer("node", ["server.js"], {}, 2, 5000);
    for (const t of result.allTimes) {
      expect(t).toBeGreaterThan(0);
    }
  });

  it("p50 and p95 are within min..max", async () => {
    spawnImpl = () => makeRespondingChild(5);
    const result = await benchServer("node", ["server.js"], {}, 4, 5000);
    expect(result.p50).toBeGreaterThanOrEqual(result.min);
    expect(result.p50).toBeLessThanOrEqual(result.max);
    expect(result.p95).toBeGreaterThanOrEqual(result.min);
    expect(result.p95).toBeLessThanOrEqual(result.max);
  });

  it("single run returns equal min/max/p50/p95", async () => {
    spawnImpl = () => makeRespondingChild(10);
    const result = await benchServer("node", ["server.js"], {}, 1, 5000);
    expect(result.min).toBe(result.max);
    expect(result.p50).toBe(result.min);
    expect(result.p95).toBe(result.min);
  });
});

describe("benchServer — failing server", () => {
  it("returns error when spawn emits error event", async () => {
    spawnImpl = () => makeErrorChild("ENOENT: command not found");
    const result = await benchServer("nonexistent", [], {}, 1, 5000);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("ENOENT");
  });

  it("returns error when process exits before responding", async () => {
    spawnImpl = () => makeFailingChild(1);
    const result = await benchServer("node", ["crash.js"], {}, 1, 5000);
    expect(result.error).toBeDefined();
  });
});

describe("benchServer — env passthrough", () => {
  it("passes env vars to spawn", async () => {
    const { spawn } = await import("node:child_process");
    spawnImpl = () => makeRespondingChild(5);
    await benchServer("node", ["srv.js"], { MY_VAR: "hello" }, 1, 5000);
    expect(spawn).toHaveBeenCalledWith(
      "node",
      ["srv.js"],
      expect.objectContaining({
        env: expect.objectContaining({ MY_VAR: "hello" }),
      }),
    );
  });
});

describe("benchServer — stats edge cases", () => {
  it("handles runs=1 without crashing", async () => {
    spawnImpl = () => makeRespondingChild(2);
    const result = await benchServer("node", [], {}, 1, 5000);
    expect(result.runs).toBe(1);
    expect(result.allTimes).toHaveLength(1);
  });

  it("avg is rounded integer", async () => {
    spawnImpl = () => makeRespondingChild(3);
    const result = await benchServer("node", [], {}, 5, 5000);
    expect(Number.isInteger(result.avg)).toBe(true);
  });
});
