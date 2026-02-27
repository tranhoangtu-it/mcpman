/**
 * profile-service.test.ts
 * Unit tests for profile CRUD operations.
 * Uses temp directories for isolation and mocks readLockfile.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LockfileData } from "../../src/core/lockfile.js";

// Mock lockfile before importing profile-service
vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: vi.fn(),
  writeLockfile: vi.fn(),
  resolveLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
  findLockfile: vi.fn().mockReturnValue(null),
  getGlobalLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
}));

import {
  createProfile,
  listProfiles,
  loadProfile,
  deleteProfile,
  type Profile,
} from "../../src/core/profile-service.js";
import { readLockfile } from "../../src/core/lockfile.js";

let tmpDir: string;

function makeLockEntry(overrides = {}) {
  return {
    version: "1.0.0",
    source: "npm" as const,
    resolved: "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",
    integrity: "sha512-abc",
    runtime: "node" as const,
    command: "npx",
    args: ["-y", "foo@1.0.0"],
    envVars: [],
    installedAt: "2024-01-01T00:00:00.000Z",
    clients: ["claude-desktop" as const],
    ...overrides,
  };
}

function makeLockfile(servers: LockfileData["servers"] = {}): LockfileData {
  return { lockfileVersion: 1, servers };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-profile-test-"));
  vi.clearAllMocks();
  (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(makeLockfile());
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── createProfile ──────────────────────────────────────────────────────────────

describe("createProfile()", () => {
  it("saves JSON file in the specified directory", () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "my-server": makeLockEntry() }),
    );

    const profile = createProfile("dev", "Dev profile", tmpDir);

    const filePath = path.join(tmpDir, "dev.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Profile;
    expect(raw.name).toBe("dev");
    expect(raw.description).toBe("Dev profile");
    expect(raw.servers).toHaveProperty("my-server");
    expect(profile.name).toBe("dev");
  });

  it("includes createdAt timestamp", () => {
    const profile = createProfile("ts-test", "", tmpDir);
    expect(profile.createdAt).toBeTruthy();
    expect(new Date(profile.createdAt).getTime()).not.toBeNaN();
  });

  it("snapshots empty servers when lockfile is empty", () => {
    const profile = createProfile("empty", "", tmpDir);
    expect(profile.servers).toEqual({});
  });

  it("throws if profile with same name already exists", () => {
    createProfile("dup", "", tmpDir);
    expect(() => createProfile("dup", "", tmpDir)).toThrow(/already exists/i);
  });

  it("creates profiles directory if it does not exist", () => {
    const nestedDir = path.join(tmpDir, "nested", "profiles");
    expect(fs.existsSync(nestedDir)).toBe(false);
    createProfile("new-dir-profile", "", nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });
});

// ── listProfiles ───────────────────────────────────────────────────────────────

describe("listProfiles()", () => {
  it("returns empty array when no profiles exist", () => {
    const result = listProfiles(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns saved profiles sorted by name", () => {
    createProfile("zebra", "", tmpDir);
    createProfile("alpha", "", tmpDir);
    createProfile("mango", "", tmpDir);

    const profiles = listProfiles(tmpDir);
    expect(profiles.map((p) => p.name)).toEqual(["alpha", "mango", "zebra"]);
  });

  it("skips corrupt (non-JSON) files silently", () => {
    createProfile("good", "", tmpDir);
    fs.writeFileSync(path.join(tmpDir, "bad.json"), "not-json", "utf-8");

    const profiles = listProfiles(tmpDir);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("good");
  });

  it("ignores non-.json files in the directory", () => {
    createProfile("valid", "", tmpDir);
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# readme", "utf-8");

    const profiles = listProfiles(tmpDir);
    expect(profiles).toHaveLength(1);
  });
});

// ── loadProfile ────────────────────────────────────────────────────────────────

describe("loadProfile()", () => {
  it("returns null for a profile that does not exist", () => {
    const result = loadProfile("nonexistent", tmpDir);
    expect(result).toBeNull();
  });

  it("loads and returns a previously created profile", () => {
    (readLockfile as ReturnType<typeof vi.fn>).mockReturnValue(
      makeLockfile({ "server-a": makeLockEntry() }),
    );
    createProfile("production", "Prod", tmpDir);

    const loaded = loadProfile("production", tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("production");
    expect(loaded!.description).toBe("Prod");
    expect(loaded!.servers).toHaveProperty("server-a");
  });

  it("returns null for a corrupt JSON file", () => {
    fs.writeFileSync(path.join(tmpDir, "corrupt.json"), "{invalid}", "utf-8");
    const result = loadProfile("corrupt", tmpDir);
    expect(result).toBeNull();
  });
});

// ── deleteProfile ──────────────────────────────────────────────────────────────

describe("deleteProfile()", () => {
  it("returns true and removes file when profile exists", () => {
    createProfile("to-delete", "", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "to-delete.json"))).toBe(true);

    const result = deleteProfile("to-delete", tmpDir);

    expect(result).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "to-delete.json"))).toBe(false);
  });

  it("returns false when profile does not exist", () => {
    const result = deleteProfile("ghost", tmpDir);
    expect(result).toBe(false);
  });

  it("does not affect other profiles when deleting one", () => {
    createProfile("keep-me", "", tmpDir);
    createProfile("remove-me", "", tmpDir);

    deleteProfile("remove-me", tmpDir);

    const profiles = listProfiles(tmpDir);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("keep-me");
  });
});
