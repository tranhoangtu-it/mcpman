/**
 * plugin-loader.test.ts
 * Unit tests for the plugin loading, install, remove, and list functions.
 * Uses temp directories for isolation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock config-service before importing plugin-loader
vi.mock("../../src/core/config-service.js", () => {
  let store: Record<string, unknown> = {};
  return {
    readConfig: () => ({ ...store }),
    writeConfig: (data: Record<string, unknown>) => { store = { ...data }; },
    getConfigValue: (key: string) => store[key],
    setConfigValue: (key: string, value: unknown) => { store[key] = value; },
    deleteConfigValue: (key: string) => { delete store[key]; },
    // Allow tests to reset store
    __resetStore: () => { store = {}; },
  };
});

// Mock child_process.execSync to avoid real npm installs
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import {
  loadPlugin,
  loadAllPlugins,
  installPluginPackage,
  removePluginPackage,
  listPluginPackages,
  type McpmanPlugin,
} from "../../src/core/plugin-loader.js";
import { readConfig, writeConfig } from "../../src/core/config-service.js";
import { execSync } from "node:child_process";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-plugin-test-"));
  // Reset config store
  (vi.mocked(writeConfig) as unknown as (d: Record<string, unknown>) => void)({});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── loadPlugin ─────────────────────────────────────────────────────────────

describe("loadPlugin()", () => {
  it("returns null when package does not exist", () => {
    const result = loadPlugin("nonexistent-pkg", tmpDir);
    expect(result).toBeNull();
  });

  it("returns null when package exports invalid plugin", () => {
    // Create a fake module that exports an object without name/prefix/resolve
    const modDir = path.join(tmpDir, "node_modules", "bad-plugin");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(path.join(modDir, "index.js"), "module.exports = { foo: 'bar' };");
    fs.writeFileSync(path.join(modDir, "package.json"), JSON.stringify({ name: "bad-plugin", main: "index.js" }));

    const result = loadPlugin("bad-plugin", tmpDir);
    expect(result).toBeNull();
  });

  it("loads a valid plugin with name, prefix, and resolve", () => {
    const modDir = path.join(tmpDir, "node_modules", "good-plugin");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, "index.js"),
      `module.exports = {
        name: "test-registry",
        prefix: "test:",
        resolve: async (input) => ({ name: input, version: "1.0.0" }),
      };`
    );
    fs.writeFileSync(path.join(modDir, "package.json"), JSON.stringify({ name: "good-plugin", main: "index.js" }));

    const result = loadPlugin("good-plugin", tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-registry");
    expect(result!.prefix).toBe("test:");
    expect(typeof result!.resolve).toBe("function");
  });

  it("loads plugin with default export", () => {
    const modDir = path.join(tmpDir, "node_modules", "default-plugin");
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, "index.js"),
      `module.exports.default = {
        name: "default-reg",
        prefix: "def:",
        resolve: async () => ({}),
      };`
    );
    fs.writeFileSync(path.join(modDir, "package.json"), JSON.stringify({ name: "default-plugin", main: "index.js" }));

    const result = loadPlugin("default-plugin", tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("default-reg");
  });
});

// ── loadAllPlugins ─────────────────────────────────────────────────────────

describe("loadAllPlugins()", () => {
  it("returns empty array when no plugins configured", () => {
    const result = loadAllPlugins(tmpDir);
    expect(result).toEqual([]);
  });

  it("skips invalid plugins and returns valid ones", () => {
    // Set up config with two plugins
    writeConfig({ plugins: ["valid-pkg", "invalid-pkg"] } as Record<string, unknown>);

    // Create valid plugin
    const validDir = path.join(tmpDir, "node_modules", "valid-pkg");
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(
      path.join(validDir, "index.js"),
      `module.exports = { name: "valid", prefix: "v:", resolve: async () => ({}) };`
    );
    fs.writeFileSync(path.join(validDir, "package.json"), JSON.stringify({ name: "valid-pkg", main: "index.js" }));

    const result = loadAllPlugins(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("valid");
  });
});

// ── installPluginPackage ───────────────────────────────────────────────────

describe("installPluginPackage()", () => {
  it("calls npm install with correct prefix and registers in config", () => {
    installPluginPackage("my-plugin", tmpDir);

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npm install"),
      expect.objectContaining({ stdio: "pipe" })
    );

    const config = readConfig();
    expect(config.plugins).toContain("my-plugin");
  });

  it("does not add duplicate plugin to config", () => {
    writeConfig({ plugins: ["my-plugin"] } as Record<string, unknown>);
    installPluginPackage("my-plugin", tmpDir);

    const config = readConfig();
    expect(config.plugins).toEqual(["my-plugin"]);
  });

  it("creates package.json in plugin dir if missing", () => {
    installPluginPackage("some-plugin", tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "package.json"))).toBe(true);
  });
});

// ── removePluginPackage ────────────────────────────────────────────────────

describe("removePluginPackage()", () => {
  it("calls npm uninstall and removes from config", () => {
    writeConfig({ plugins: ["remove-me", "keep-me"] } as Record<string, unknown>);
    removePluginPackage("remove-me", tmpDir);

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npm uninstall"),
      expect.objectContaining({ stdio: "pipe" })
    );

    const config = readConfig();
    expect(config.plugins).not.toContain("remove-me");
    expect(config.plugins).toContain("keep-me");
  });

  it("removes from config even if npm uninstall fails", () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("npm error"); });
    writeConfig({ plugins: ["fail-pkg"] } as Record<string, unknown>);

    removePluginPackage("fail-pkg", tmpDir);

    const config = readConfig();
    expect(config.plugins).not.toContain("fail-pkg");
  });
});

// ── listPluginPackages ─────────────────────────────────────────────────────

describe("listPluginPackages()", () => {
  it("returns empty array when no plugins", () => {
    expect(listPluginPackages()).toEqual([]);
  });

  it("returns plugin names from config", () => {
    writeConfig({ plugins: ["plugin-a", "plugin-b"] } as Record<string, unknown>);
    expect(listPluginPackages()).toEqual(["plugin-a", "plugin-b"]);
  });
});
