/**
 * pin-service.test.ts
 * Unit tests for version pinning CRUD at ~/.mcpman/pins.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPinnedVersion,
  isPinned,
  listPins,
  pinServer,
  unpinServer,
} from "../../src/core/pin-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-pin-test-"));
  return path.join(dir, "pins.json");
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── pinServer / getPinnedVersion ──────────────────────────────────────────────

describe("pinServer / getPinnedVersion", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("pins a server and retrieves the version", () => {
    pinServer("my-server", "1.2.3", file);
    expect(getPinnedVersion("my-server", file)).toBe("1.2.3");
  });

  it("returns null for unpinned server", () => {
    expect(getPinnedVersion("unknown", file)).toBeNull();
  });

  it("overwrites an existing pin", () => {
    pinServer("srv", "1.0.0", file);
    pinServer("srv", "2.0.0", file);
    expect(getPinnedVersion("srv", file)).toBe("2.0.0");
  });

  it("creates parent directory if missing", () => {
    const nested = path.join(os.tmpdir(), `mcpman-pin-nested-${Date.now()}`, "pins.json");
    pinServer("srv", "1.0.0", nested);
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });
});

// ── isPinned ──────────────────────────────────────────────────────────────────

describe("isPinned", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("returns false for server not pinned", () => {
    expect(isPinned("srv", file)).toBe(false);
  });

  it("returns true after pinning", () => {
    pinServer("srv", "1.0.0", file);
    expect(isPinned("srv", file)).toBe(true);
  });

  it("returns false after unpinning", () => {
    pinServer("srv", "1.0.0", file);
    unpinServer("srv", file);
    expect(isPinned("srv", file)).toBe(false);
  });
});

// ── unpinServer ───────────────────────────────────────────────────────────────

describe("unpinServer", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("removes the pin", () => {
    pinServer("srv", "1.0.0", file);
    unpinServer("srv", file);
    expect(getPinnedVersion("srv", file)).toBeNull();
  });

  it("is a no-op for unpinned server", () => {
    expect(() => unpinServer("ghost", file)).not.toThrow();
  });

  it("does not affect other pins", () => {
    pinServer("a", "1.0.0", file);
    pinServer("b", "2.0.0", file);
    unpinServer("a", file);
    expect(getPinnedVersion("b", file)).toBe("2.0.0");
  });
});

// ── listPins ──────────────────────────────────────────────────────────────────

describe("listPins", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("returns empty array when no pins exist", () => {
    expect(listPins(file)).toEqual([]);
  });

  it("returns all pinned servers sorted alphabetically", () => {
    pinServer("zebra", "3.0.0", file);
    pinServer("alpha", "1.0.0", file);
    const pins = listPins(file);
    expect(pins[0].server).toBe("alpha");
    expect(pins[1].server).toBe("zebra");
  });

  it("each entry has server and version fields", () => {
    pinServer("my-srv", "1.5.0", file);
    const pins = listPins(file);
    expect(pins[0]).toEqual({ server: "my-srv", version: "1.5.0" });
  });
});
