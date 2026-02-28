/**
 * registry-command.test.ts
 * Tests for registry-manager CRUD operations and registry command.
 * Uses temp config files to avoid touching ~/.mcpman/config.json.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRegistry,
  getDefaultRegistry,
  getRegistries,
  removeRegistry,
  setDefaultRegistry,
} from "../../src/core/registry-manager.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-registry-test-"));
  configPath = path.join(tmpDir, "config.json");
  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ── getRegistries ──────────────────────────────────────────────────────────────

describe("getRegistries", () => {
  it("returns npm and smithery builtins by default", () => {
    const registries = getRegistries(configPath);
    const names = registries.map((r) => r.name);
    expect(names).toContain("npm");
    expect(names).toContain("smithery");
  });

  it("marks builtins as builtin: true", () => {
    const registries = getRegistries(configPath);
    const npm = registries.find((r) => r.name === "npm");
    expect(npm?.builtin).toBe(true);
  });

  it("returns empty custom list when no config exists", () => {
    const registries = getRegistries(configPath);
    const custom = registries.filter((r) => !r.builtin);
    expect(custom).toHaveLength(0);
  });
});

// ── addRegistry ────────────────────────────────────────────────────────────────

describe("addRegistry", () => {
  it("persists custom registry to config", () => {
    addRegistry("corp", "https://mcp.corp.com/api", configPath);
    const registries = getRegistries(configPath);
    const corp = registries.find((r) => r.name === "corp");
    expect(corp).toBeDefined();
    expect(corp?.url).toBe("https://mcp.corp.com/api");
    expect(corp?.builtin).toBe(false);
  });

  it("throws on invalid URL", () => {
    expect(() => addRegistry("bad", "not-a-url", configPath)).toThrow(/invalid url/i);
  });

  it("throws on duplicate name", () => {
    addRegistry("myregistry", "https://example.com", configPath);
    expect(() => addRegistry("myregistry", "https://other.com", configPath)).toThrow(/already exists/i);
  });

  it("throws when adding duplicate builtin name", () => {
    expect(() => addRegistry("npm", "https://custom-npm.com", configPath)).toThrow(/already exists/i);
  });
});

// ── removeRegistry ─────────────────────────────────────────────────────────────

describe("removeRegistry", () => {
  it("removes a custom registry", () => {
    addRegistry("temp", "https://temp.example.com", configPath);
    removeRegistry("temp", configPath);
    const registries = getRegistries(configPath);
    expect(registries.find((r) => r.name === "temp")).toBeUndefined();
  });

  it("throws when removing builtin registry", () => {
    expect(() => removeRegistry("npm", configPath)).toThrow(/cannot remove/i);
  });

  it("throws when removing unknown registry", () => {
    expect(() => removeRegistry("ghost", configPath)).toThrow(/not found/i);
  });
});

// ── setDefaultRegistry / getDefaultRegistry ────────────────────────────────────

describe("setDefaultRegistry", () => {
  it("updates default registry in config", () => {
    setDefaultRegistry("smithery", configPath);
    expect(getDefaultRegistry(configPath)).toBe("smithery");
  });

  it("throws for unknown registry name", () => {
    expect(() => setDefaultRegistry("unknown-reg", configPath)).toThrow(/not found/i);
  });
});

describe("getDefaultRegistry", () => {
  it("returns npm when no default set", () => {
    expect(getDefaultRegistry(configPath)).toBe("npm");
  });

  it("returns custom default after set-default", () => {
    addRegistry("internal", "https://internal.example.com", configPath);
    setDefaultRegistry("internal", configPath);
    expect(getDefaultRegistry(configPath)).toBe("internal");
  });
});
