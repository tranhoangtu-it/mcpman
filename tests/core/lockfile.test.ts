import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addEntry,
  createEmptyLockfile,
  getLockedVersion,
  LOCKFILE_NAME,
  readLockfile,
  removeEntry,
  writeLockfile,
  type LockEntry,
} from "../../src/core/lockfile.js";

function makeTmpPath(): string {
  return path.join(os.tmpdir(), `mcpman-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function makeEntry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    version: "1.0.0",
    source: "npm",
    resolved: "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",
    integrity: "sha512-abc",
    runtime: "node",
    command: "npx",
    args: ["-y", "foo@1.0.0"],
    envVars: [],
    installedAt: "2024-01-01T00:00:00.000Z",
    clients: ["claude-desktop"],
    ...overrides,
  };
}

describe("lockfile", () => {
  let tmpDir: string;
  let lockfilePath: string;

  beforeEach(() => {
    tmpDir = makeTmpPath();
    fs.mkdirSync(tmpDir, { recursive: true });
    lockfilePath = path.join(tmpDir, LOCKFILE_NAME);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readLockfile()", () => {
    it("returns empty lockfile when file does not exist", () => {
      const data = readLockfile(lockfilePath);
      expect(data.lockfileVersion).toBe(1);
      expect(data.servers).toEqual({});
    });

    it("returns empty lockfile on invalid JSON", () => {
      fs.writeFileSync(lockfilePath, "NOT JSON");
      const data = readLockfile(lockfilePath);
      expect(data.servers).toEqual({});
    });

    it("reads valid lockfile", () => {
      const entry = makeEntry();
      const raw = { lockfileVersion: 1, servers: { foo: entry } };
      fs.writeFileSync(lockfilePath, JSON.stringify(raw));
      const data = readLockfile(lockfilePath);
      expect(data.servers["foo"]).toMatchObject({ version: "1.0.0" });
    });
  });

  describe("writeLockfile()", () => {
    it("writes lockfile and creates parent directories", () => {
      const nested = path.join(tmpDir, "sub", "dir", LOCKFILE_NAME);
      writeLockfile({ lockfileVersion: 1, servers: {} }, nested);
      expect(fs.existsSync(nested)).toBe(true);
    });

    it("serializes with sorted server keys", () => {
      writeLockfile(
        {
          lockfileVersion: 1,
          servers: {
            zebra: makeEntry({ version: "2.0.0" }),
            alpha: makeEntry({ version: "1.0.0" }),
          },
        },
        lockfilePath
      );
      const raw = fs.readFileSync(lockfilePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(Object.keys(parsed.servers)).toEqual(["alpha", "zebra"]);
    });

    it("uses atomic write (no stale .tmp file)", () => {
      writeLockfile({ lockfileVersion: 1, servers: {} }, lockfilePath);
      expect(fs.existsSync(`${lockfilePath}.tmp`)).toBe(false);
    });
  });

  describe("addEntry()", () => {
    it("adds a new server entry", () => {
      addEntry("my-server", makeEntry(), lockfilePath);
      const data = readLockfile(lockfilePath);
      expect(data.servers["my-server"]).toBeDefined();
      expect(data.servers["my-server"].version).toBe("1.0.0");
    });

    it("overwrites existing entry", () => {
      addEntry("my-server", makeEntry({ version: "1.0.0" }), lockfilePath);
      addEntry("my-server", makeEntry({ version: "2.0.0" }), lockfilePath);
      const data = readLockfile(lockfilePath);
      expect(data.servers["my-server"].version).toBe("2.0.0");
    });
  });

  describe("removeEntry()", () => {
    it("removes an existing entry", () => {
      addEntry("to-remove", makeEntry(), lockfilePath);
      removeEntry("to-remove", lockfilePath);
      const data = readLockfile(lockfilePath);
      expect(data.servers["to-remove"]).toBeUndefined();
    });

    it("is a no-op when entry does not exist", () => {
      writeLockfile({ lockfileVersion: 1, servers: {} }, lockfilePath);
      expect(() => removeEntry("nonexistent", lockfilePath)).not.toThrow();
    });
  });

  describe("getLockedVersion()", () => {
    it("returns version for existing server", () => {
      addEntry("foo", makeEntry({ version: "3.1.0" }), lockfilePath);
      expect(getLockedVersion("foo", lockfilePath)).toBe("3.1.0");
    });

    it("returns undefined for missing server", () => {
      writeLockfile({ lockfileVersion: 1, servers: {} }, lockfilePath);
      expect(getLockedVersion("missing", lockfilePath)).toBeUndefined();
    });
  });

  describe("createEmptyLockfile()", () => {
    it("creates a file with empty servers", () => {
      createEmptyLockfile(lockfilePath);
      const data = readLockfile(lockfilePath);
      expect(data.lockfileVersion).toBe(1);
      expect(data.servers).toEqual({});
    });
  });
});
