/**
 * template-service.test.ts
 * Unit tests for install templates at ~/.mcpman/templates/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/paths.js", () => ({
  getTemplatesDir: vi.fn(),
}));

vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: vi.fn(),
  resolveLockfilePath: vi.fn(() => "/fake/mcpman.lock"),
}));

import { getTemplatesDir } from "../../src/utils/paths.js";
import { readLockfile } from "../../src/core/lockfile.js";
import {
  applyTemplate,
  deleteTemplate,
  listTemplates,
  loadTemplate,
  saveTemplate,
} from "../../src/core/template-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-template-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const MOCK_LOCKFILE = {
  lockfileVersion: 1 as const,
  servers: {
    "server-a": {
      version: "1.0.0",
      source: "npm" as const,
      command: "node",
      args: ["a.js"],
      resolved: "",
      integrity: "",
      runtime: "node" as const,
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: [],
    },
    "server-b": {
      version: "2.0.0",
      source: "github" as const,
      command: "python",
      args: ["b.py"],
      resolved: "",
      integrity: "",
      runtime: "python" as const,
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: [],
    },
  },
};

// ── saveTemplate ──────────────────────────────────────────────────────────────

describe("saveTemplate", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(getTemplatesDir).mockReturnValue(dir);
    vi.mocked(readLockfile).mockReturnValue(MOCK_LOCKFILE);
  });
  afterEach(() => cleanup(dir));

  it("saves a template file with server snapshot", () => {
    saveTemplate("myteam");
    const tmpl = loadTemplate("myteam", dir);
    expect(tmpl).not.toBeNull();
    expect(tmpl!.servers).toHaveLength(2);
  });

  it("saves template name and description", () => {
    saveTemplate("prod", { description: "Production setup" });
    const tmpl = loadTemplate("prod", dir);
    expect(tmpl!.name).toBe("prod");
    expect(tmpl!.description).toBe("Production setup");
  });

  it("stores createdAt as ISO date", () => {
    saveTemplate("t");
    const tmpl = loadTemplate("t", dir);
    expect(new Date(tmpl!.createdAt).getTime()).toBeGreaterThan(0);
  });

  it("stores server name, source and version", () => {
    saveTemplate("check");
    const tmpl = loadTemplate("check", dir);
    const serverA = tmpl!.servers.find((s) => s.name === "server-a");
    expect(serverA?.source).toBe("npm");
    expect(serverA?.version).toBe("1.0.0");
  });

  it("creates templates dir if missing", () => {
    const nested = path.join(os.tmpdir(), `tmpl-nested-${Date.now()}`);
    vi.mocked(getTemplatesDir).mockReturnValue(nested);
    saveTemplate("x", { dir: nested });
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(nested, { recursive: true, force: true });
  });
});

// ── loadTemplate ──────────────────────────────────────────────────────────────

describe("loadTemplate", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(getTemplatesDir).mockReturnValue(dir);
    vi.mocked(readLockfile).mockReturnValue(MOCK_LOCKFILE);
  });
  afterEach(() => cleanup(dir));

  it("returns null for nonexistent template", () => {
    expect(loadTemplate("ghost", dir)).toBeNull();
  });

  it("loads a saved template", () => {
    saveTemplate("t");
    expect(loadTemplate("t", dir)).not.toBeNull();
  });
});

// ── listTemplates ─────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(getTemplatesDir).mockReturnValue(dir);
    vi.mocked(readLockfile).mockReturnValue(MOCK_LOCKFILE);
  });
  afterEach(() => cleanup(dir));

  it("returns empty array when no templates", () => {
    expect(listTemplates(dir)).toEqual([]);
  });

  it("lists saved template names sorted", () => {
    saveTemplate("zebra");
    saveTemplate("alpha");
    expect(listTemplates(dir)).toEqual(["alpha", "zebra"]);
  });
});

// ── deleteTemplate ────────────────────────────────────────────────────────────

describe("deleteTemplate", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(getTemplatesDir).mockReturnValue(dir);
    vi.mocked(readLockfile).mockReturnValue(MOCK_LOCKFILE);
  });
  afterEach(() => cleanup(dir));

  it("deletes an existing template", () => {
    saveTemplate("to-delete");
    deleteTemplate("to-delete", dir);
    expect(loadTemplate("to-delete", dir)).toBeNull();
  });

  it("is a no-op for nonexistent template", () => {
    expect(() => deleteTemplate("ghost", dir)).not.toThrow();
  });

  it("does not affect other templates", () => {
    saveTemplate("keep");
    saveTemplate("del");
    deleteTemplate("del", dir);
    expect(loadTemplate("keep", dir)).not.toBeNull();
  });
});

// ── applyTemplate ─────────────────────────────────────────────────────────────

describe("applyTemplate", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(getTemplatesDir).mockReturnValue(dir);
    vi.mocked(readLockfile).mockReturnValue(MOCK_LOCKFILE);
  });
  afterEach(() => cleanup(dir));

  it("throws for nonexistent template", () => {
    expect(() => applyTemplate("ghost", dir)).toThrow("not found");
  });

  it("returns install commands for each server", () => {
    saveTemplate("t");
    const commands = applyTemplate("t", dir);
    expect(commands).toHaveLength(2);
    expect(commands.every((c) => c.startsWith("mcpman install "))).toBe(true);
  });

  it("includes version in install command", () => {
    saveTemplate("t");
    const commands = applyTemplate("t", dir);
    expect(commands.some((c) => c.includes("@1.0.0") || c.includes("@2.0.0"))).toBe(true);
  });
});
