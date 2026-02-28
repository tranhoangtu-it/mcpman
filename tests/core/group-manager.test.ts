/**
 * group-manager.test.ts
 * Unit tests for server group CRUD in ~/.mcpman/groups.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addToGroup,
  deleteGroup,
  getGroup,
  groupExists,
  listGroups,
  removeFromGroup,
} from "../../src/core/group-manager.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-group-test-"));
  return path.join(dir, "groups.json");
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── addToGroup ────────────────────────────────────────────────────────────────

describe("addToGroup", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("creates a new group with servers", () => {
    addToGroup("dev", ["server-a", "server-b"], file);
    expect(getGroup("dev", file)).toEqual(["server-a", "server-b"]);
  });

  it("deduplicates when adding same server twice", () => {
    addToGroup("dev", ["server-a"], file);
    addToGroup("dev", ["server-a", "server-b"], file);
    const members = getGroup("dev", file);
    expect(members.filter((s) => s === "server-a")).toHaveLength(1);
    expect(members).toContain("server-b");
  });

  it("members are stored sorted alphabetically", () => {
    addToGroup("g", ["zebra", "alpha", "middle"], file);
    expect(getGroup("g", file)).toEqual(["alpha", "middle", "zebra"]);
  });

  it("creates parent directory if missing", () => {
    const nested = path.join(os.tmpdir(), `mcpman-nested-${Date.now()}`, "groups.json`");
    addToGroup("g", ["srv"], nested);
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });
});

// ── removeFromGroup ───────────────────────────────────────────────────────────

describe("removeFromGroup", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("removes specific servers from a group", () => {
    addToGroup("g", ["a", "b", "c"], file);
    removeFromGroup("g", ["b"], file);
    expect(getGroup("g", file)).toEqual(["a", "c"]);
  });

  it("deletes the group when last member is removed", () => {
    addToGroup("g", ["only"], file);
    removeFromGroup("g", ["only"], file);
    expect(groupExists("g", file)).toBe(false);
  });

  it("is a no-op for nonexistent group", () => {
    expect(() => removeFromGroup("ghost", ["srv"], file)).not.toThrow();
  });
});

// ── getGroup ──────────────────────────────────────────────────────────────────

describe("getGroup", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("returns empty array for unknown group", () => {
    expect(getGroup("missing", file)).toEqual([]);
  });

  it("returns members of existing group", () => {
    addToGroup("prod", ["srv1", "srv2"], file);
    expect(getGroup("prod", file)).toContain("srv1");
    expect(getGroup("prod", file)).toContain("srv2");
  });
});

// ── listGroups ────────────────────────────────────────────────────────────────

describe("listGroups", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("returns empty array when no groups exist", () => {
    expect(listGroups(file)).toEqual([]);
  });

  it("returns all group names sorted", () => {
    addToGroup("zebra", ["s1"], file);
    addToGroup("alpha", ["s2"], file);
    expect(listGroups(file)).toEqual(["alpha", "zebra"]);
  });
});

// ── deleteGroup ───────────────────────────────────────────────────────────────

describe("deleteGroup", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("deletes an existing group", () => {
    addToGroup("g", ["srv"], file);
    deleteGroup("g", file);
    expect(groupExists("g", file)).toBe(false);
  });

  it("is a no-op for nonexistent group", () => {
    expect(() => deleteGroup("ghost", file)).not.toThrow();
  });

  it("does not affect other groups", () => {
    addToGroup("keep", ["s1"], file);
    addToGroup("remove", ["s2"], file);
    deleteGroup("remove", file);
    expect(groupExists("keep", file)).toBe(true);
  });
});

// ── groupExists ───────────────────────────────────────────────────────────────

describe("groupExists", () => {
  let file: string;
  beforeEach(() => { file = makeTmpFile(); });
  afterEach(() => { cleanup(file); });

  it("returns false for nonexistent group", () => {
    expect(groupExists("missing", file)).toBe(false);
  });

  it("returns true after group is created", () => {
    addToGroup("exists", ["srv"], file);
    expect(groupExists("exists", file)).toBe(true);
  });
});
