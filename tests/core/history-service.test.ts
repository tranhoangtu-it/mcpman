/**
 * history-service.test.ts
 * Unit tests for CLI history ring buffer at ~/.mcpman/history.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/paths.js", () => ({
  getHistoryFile: vi.fn(),
}));

import { clearHistory, getHistory, recordCommand } from "../../src/core/history-service.js";
import { getHistoryFile } from "../../src/utils/paths.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-history-test-"));
  return path.join(dir, "history.json");
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── recordCommand ─────────────────────────────────────────────────────────────

describe("recordCommand", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getHistoryFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("records a command entry", () => {
    recordCommand(["install", "@scope/pkg"]);
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].command).toBe("install");
    expect(history[0].args).toEqual(["@scope/pkg"]);
  });

  it("stores ISO timestamp", () => {
    recordCommand(["list"]);
    const history = getHistory();
    expect(new Date(history[0].timestamp).getTime()).toBeGreaterThan(0);
  });

  it("accumulates multiple entries", () => {
    recordCommand(["install", "a"]);
    recordCommand(["remove", "b"]);
    expect(getHistory()).toHaveLength(2);
  });

  it("trims to 50 entries (ring buffer)", () => {
    for (let i = 0; i < 55; i++) {
      recordCommand(["cmd", String(i)]);
    }
    const history = getHistory();
    expect(history).toHaveLength(50);
    // Last entry should be index 54
    expect(history[history.length - 1].args[0]).toBe("54");
  });

  it("handles empty argv gracefully", () => {
    recordCommand([]);
    const history = getHistory();
    expect(history[0].command).toBe("");
    expect(history[0].args).toEqual([]);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe("getHistory", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getHistoryFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("returns empty array when file does not exist", () => {
    expect(getHistory()).toEqual([]);
  });

  it("returns entries in insertion order (oldest first)", () => {
    recordCommand(["a"]);
    recordCommand(["b"]);
    const history = getHistory();
    expect(history[0].command).toBe("a");
    expect(history[1].command).toBe("b");
  });
});

// ── clearHistory ──────────────────────────────────────────────────────────────

describe("clearHistory", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getHistoryFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("clears all history", () => {
    recordCommand(["install", "pkg"]);
    clearHistory();
    expect(getHistory()).toEqual([]);
  });

  it("is a no-op when history is already empty", () => {
    expect(() => clearHistory()).not.toThrow();
  });
});
