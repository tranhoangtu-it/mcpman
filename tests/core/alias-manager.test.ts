/**
 * alias-manager.test.ts
 * Unit tests for command alias CRUD at ~/.mcpman/aliases.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/paths.js", () => ({
  getAliasesFile: vi.fn(),
}));

import {
  addAlias,
  aliasExists,
  getAlias,
  listAliases,
  removeAlias,
  resolveAlias,
} from "../../src/core/alias-manager.js";
import { getAliasesFile } from "../../src/utils/paths.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-alias-test-"));
  return path.join(dir, "aliases.json");
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── addAlias / getAlias ───────────────────────────────────────────────────────

describe("addAlias / getAlias", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getAliasesFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("stores and retrieves an alias", () => {
    addAlias("dev", "group run dev-servers");
    expect(getAlias("dev")).toBe("group run dev-servers");
  });

  it("returns null for unknown alias", () => {
    expect(getAlias("unknown")).toBeNull();
  });

  it("overwrites existing alias", () => {
    addAlias("x", "old command");
    addAlias("x", "new command");
    expect(getAlias("x")).toBe("new command");
  });

  it("creates parent directory if missing", () => {
    const nested = path.join(os.tmpdir(), `mcpman-alias-nested-${Date.now()}`, "aliases.json");
    vi.mocked(getAliasesFile).mockReturnValue(nested);
    addAlias("test", "cmd");
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });
});

// ── removeAlias ───────────────────────────────────────────────────────────────

describe("removeAlias", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getAliasesFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("removes an existing alias", () => {
    addAlias("a", "cmd");
    removeAlias("a");
    expect(getAlias("a")).toBeNull();
  });

  it("is a no-op for nonexistent alias", () => {
    expect(() => removeAlias("ghost")).not.toThrow();
  });

  it("does not affect other aliases", () => {
    addAlias("keep", "keep-cmd");
    addAlias("del", "del-cmd");
    removeAlias("del");
    expect(getAlias("keep")).toBe("keep-cmd");
  });
});

// ── listAliases ───────────────────────────────────────────────────────────────

describe("listAliases", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getAliasesFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("returns empty array when no aliases", () => {
    expect(listAliases()).toEqual([]);
  });

  it("returns aliases sorted by name", () => {
    addAlias("zebra", "cmd-z");
    addAlias("alpha", "cmd-a");
    const aliases = listAliases();
    expect(aliases[0].name).toBe("alpha");
    expect(aliases[1].name).toBe("zebra");
  });

  it("each entry has name and command fields", () => {
    addAlias("myalias", "my-command");
    expect(listAliases()[0]).toEqual({ name: "myalias", command: "my-command" });
  });
});

// ── resolveAlias / aliasExists ────────────────────────────────────────────────

describe("resolveAlias / aliasExists", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getAliasesFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("resolveAlias returns command string for known alias", () => {
    addAlias("run-all", "group run all");
    expect(resolveAlias("run-all")).toBe("group run all");
  });

  it("resolveAlias returns null for unknown alias", () => {
    expect(resolveAlias("unknown")).toBeNull();
  });

  it("aliasExists returns false before adding", () => {
    expect(aliasExists("x")).toBe(false);
  });

  it("aliasExists returns true after adding", () => {
    addAlias("x", "cmd");
    expect(aliasExists("x")).toBe(true);
  });
});
