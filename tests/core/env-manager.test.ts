/**
 * env-manager.test.ts
 * Unit tests for per-server env var CRUD in ~/.mcpman/env/<server>.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearEnv,
  deleteEnv,
  getEnv,
  listEnv,
  listEnvServers,
  setEnv,
} from "../../src/core/env-manager.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-env-test-"));
}

// ── setEnv / getEnv ───────────────────────────────────────────────────────────

describe("setEnv / getEnv", () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("stores and retrieves a value", () => {
    setEnv("my-server", "DB_HOST", "localhost", dir);
    expect(getEnv("my-server", "DB_HOST", dir)).toBe("localhost");
  });

  it("returns null for missing key", () => {
    expect(getEnv("my-server", "MISSING", dir)).toBeNull();
  });

  it("returns null for unknown server", () => {
    expect(getEnv("unknown", "KEY", dir)).toBeNull();
  });

  it("overwrites an existing key", () => {
    setEnv("srv", "PORT", "3000", dir);
    setEnv("srv", "PORT", "4000", dir);
    expect(getEnv("srv", "PORT", dir)).toBe("4000");
  });

  it("stores multiple keys for a server", () => {
    setEnv("srv", "A", "1", dir);
    setEnv("srv", "B", "2", dir);
    expect(getEnv("srv", "A", dir)).toBe("1");
    expect(getEnv("srv", "B", dir)).toBe("2");
  });

  it("creates the env dir if missing", () => {
    const nested = path.join(dir, "nested-env-dir");
    setEnv("srv", "KEY", "val", nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it("sanitizes server names with @ and / in filenames", () => {
    setEnv("@scope/pkg", "TOKEN", "abc", dir);
    expect(getEnv("@scope/pkg", "TOKEN", dir)).toBe("abc");
  });
});

// ── listEnv ───────────────────────────────────────────────────────────────────

describe("listEnv", () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns all key-value pairs", () => {
    setEnv("srv", "X", "1", dir);
    setEnv("srv", "Y", "2", dir);
    const store = listEnv("srv", dir);
    expect(store).toEqual({ X: "1", Y: "2" });
  });

  it("returns empty object for unknown server", () => {
    expect(listEnv("ghost", dir)).toEqual({});
  });
});

// ── deleteEnv ────────────────────────────────────────────────────────────────

describe("deleteEnv", () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("removes a specific key", () => {
    setEnv("srv", "A", "1", dir);
    setEnv("srv", "B", "2", dir);
    deleteEnv("srv", "A", dir);
    expect(getEnv("srv", "A", dir)).toBeNull();
    expect(getEnv("srv", "B", dir)).toBe("2");
  });

  it("is a no-op for missing key", () => {
    setEnv("srv", "A", "1", dir);
    expect(() => deleteEnv("srv", "MISSING", dir)).not.toThrow();
    expect(getEnv("srv", "A", dir)).toBe("1");
  });

  it("is a no-op for unknown server", () => {
    expect(() => deleteEnv("ghost", "KEY", dir)).not.toThrow();
  });
});

// ── clearEnv ─────────────────────────────────────────────────────────────────

describe("clearEnv", () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("removes the server env file", () => {
    setEnv("srv", "KEY", "val", dir);
    clearEnv("srv", dir);
    expect(listEnv("srv", dir)).toEqual({});
  });

  it("is a no-op for unknown server", () => {
    expect(() => clearEnv("ghost", dir)).not.toThrow();
  });
});

// ── listEnvServers ────────────────────────────────────────────────────────────

describe("listEnvServers", () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns server names with stored env vars", () => {
    setEnv("alpha", "K", "v", dir);
    setEnv("beta", "K", "v", dir);
    const servers = listEnvServers(dir);
    expect(servers).toContain("alpha");
    expect(servers).toContain("beta");
  });

  it("returns empty array when dir does not exist", () => {
    const nonexistent = path.join(dir, "no-such-dir");
    expect(listEnvServers(nonexistent)).toEqual([]);
  });

  it("excludes non-json files", () => {
    fs.writeFileSync(path.join(dir, "notjson.txt"), "");
    const servers = listEnvServers(dir);
    expect(servers).not.toContain("notjson.txt");
  });
});
