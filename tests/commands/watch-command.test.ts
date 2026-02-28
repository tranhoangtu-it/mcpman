/**
 * watch-command.test.ts
 * Tests for file-watcher-service ServerWatcher class.
 * Mocks child_process.spawn and fs.watch to avoid real processes/FS events.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock fs — must be hoisted before imports ───────────────────────────────────

const mockWatcher = { close: vi.fn() };
let capturedWatchCallback: ((event: string, filename: string) => void) | null = null;

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      watch: vi.fn((_dir: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
        capturedWatchCallback = cb;
        return mockWatcher;
      }),
    },
    watch: vi.fn((_dir: string, _opts: unknown, cb: (event: string, filename: string) => void) => {
      capturedWatchCallback = cb;
      return mockWatcher;
    }),
  };
});

// ── Mock child_process ─────────────────────────────────────────────────────────

class MockChildProcess extends EventEmitter {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  kill(signal?: string) {
    this.killed = true;
    setTimeout(() => this.emit("close", 0), 5);
    return true;
  }
}

let mockChild: MockChildProcess;

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    mockChild = new MockChildProcess();
    return mockChild;
  }),
}));

import { spawn } from "node:child_process";
import fs from "node:fs";
import { ServerWatcher } from "../../src/core/file-watcher-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOptions(overrides: Partial<Parameters<ServerWatcher["start"]>[0]> = {}) {
  return {
    command: "node",
    args: ["server.js"],
    env: {},
    watchDir: "/tmp/my-server",
    extensions: ["ts", "js", "json"],
    debounceMs: 50,
    clearOnRestart: false,
    serverName: "my-server",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedWatchCallback = null;
});

afterEach(() => {
  vi.useRealTimers();
});

// ── spawn ──────────────────────────────────────────────────────────────────────

describe("ServerWatcher — spawn", () => {
  it("spawns child process on start", () => {
    const watcher = new ServerWatcher();
    watcher.start(makeOptions());
    expect(spawn).toHaveBeenCalledWith("node", ["server.js"], expect.objectContaining({ env: {} }));
  });

  it("starts fs.watch on the watchDir", () => {
    const watcher = new ServerWatcher();
    watcher.start(makeOptions());
    expect(fs.watch).toHaveBeenCalledWith(
      "/tmp/my-server",
      { recursive: true },
      expect.any(Function),
    );
  });
});

// ── stop ───────────────────────────────────────────────────────────────────────

describe("ServerWatcher — stop", () => {
  it("closes watcher and kills child on stop", () => {
    const watcher = new ServerWatcher();
    watcher.start(makeOptions());
    watcher.stop();
    expect(mockWatcher.close).toHaveBeenCalled();
    expect(mockChild.killed).toBe(true);
  });

  it("reports restart count on stop", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const watcher = new ServerWatcher();
    watcher.start(makeOptions());
    watcher.stop();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/stopped/i);
    logSpy.mockRestore();
  });
});

// ── extension filter ───────────────────────────────────────────────────────────

describe("ServerWatcher — extension filter", () => {
  it("does not restart on non-matching file extension", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ extensions: ["ts", "js"] }));

    expect(capturedWatchCallback).not.toBeNull();
    capturedWatchCallback!("change", "README.md");

    await vi.runAllTimersAsync();
    // spawn called only once (initial), no restart
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("restarts on matching file extension", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ extensions: ["ts"], debounceMs: 10 }));

    expect(capturedWatchCallback).not.toBeNull();
    capturedWatchCallback!("change", "src/index.ts");

    await vi.runAllTimersAsync();
    expect(watcher.getRestartCount()).toBe(1);
  });
});

// ── ignore patterns ────────────────────────────────────────────────────────────

describe("ServerWatcher — ignore patterns", () => {
  it("ignores changes in node_modules", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ debounceMs: 10 }));

    expect(capturedWatchCallback).not.toBeNull();
    capturedWatchCallback!("change", "node_modules/some-pkg/index.js");

    await vi.runAllTimersAsync();
    expect(watcher.getRestartCount()).toBe(0);
  });

  it("ignores changes in dist directory", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ debounceMs: 10 }));

    expect(capturedWatchCallback).not.toBeNull();
    capturedWatchCallback!("change", "dist/index.js");

    await vi.runAllTimersAsync();
    expect(watcher.getRestartCount()).toBe(0);
  });
});

// ── debounce ───────────────────────────────────────────────────────────────────

describe("ServerWatcher — debounce", () => {
  it("coalesces rapid file changes into a single restart", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ extensions: ["ts"], debounceMs: 100 }));

    expect(capturedWatchCallback).not.toBeNull();
    // Fire 5 rapid changes
    for (let i = 0; i < 5; i++) {
      capturedWatchCallback!("change", "src/index.ts");
    }

    await vi.runAllTimersAsync();
    // Only 1 restart despite 5 events
    expect(watcher.getRestartCount()).toBe(1);
  });
});

// ── restart counter ────────────────────────────────────────────────────────────

describe("ServerWatcher — restart counter", () => {
  it("increments restart count on each file change trigger", async () => {
    vi.useFakeTimers();
    const watcher = new ServerWatcher();
    watcher.start(makeOptions({ extensions: ["ts"], debounceMs: 10 }));

    expect(capturedWatchCallback).not.toBeNull();

    capturedWatchCallback!("change", "a.ts");
    await vi.runAllTimersAsync();

    capturedWatchCallback!("change", "b.ts");
    await vi.runAllTimersAsync();

    expect(watcher.getRestartCount()).toBe(2);
  });
});
