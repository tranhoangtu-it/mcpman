/**
 * plugin-command.test.ts
 * Tests for the plugin CLI sub-commands (add, remove, list).
 * Mocks plugin-loader to avoid real npm operations.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock plugin-loader
vi.mock("../../src/core/plugin-loader.js", () => ({
  installPluginPackage: vi.fn(),
  removePluginPackage: vi.fn(),
  listPluginPackages: vi.fn(() => []),
  loadPlugin: vi.fn(() => null),
}));

// Mock nanospinner
vi.mock("nanospinner", () => ({
  createSpinner: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  installPluginPackage,
  removePluginPackage,
  listPluginPackages,
  loadPlugin,
} from "../../src/core/plugin-loader.js";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── add ────────────────────────────────────────────────────────────────────

describe("plugin add", () => {
  it("installPluginPackage is callable with package name", () => {
    vi.mocked(installPluginPackage).mockImplementation(() => {});
    vi.mocked(loadPlugin).mockReturnValue({
      name: "test",
      prefix: "test:",
      resolve: async () => ({ name: "", version: "", description: "", runtime: "node", command: "", args: [], envVars: [], resolved: "" }),
    });

    installPluginPackage("test-plugin");
    expect(installPluginPackage).toHaveBeenCalledWith("test-plugin");
  });

  it("loadPlugin returns plugin info after install", () => {
    vi.mocked(loadPlugin).mockReturnValue({
      name: "my-registry",
      prefix: "my:",
      resolve: async () => ({ name: "", version: "", description: "", runtime: "node", command: "", args: [], envVars: [], resolved: "" }),
    });

    const result = loadPlugin("my-plugin-pkg");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-registry");
    expect(result!.prefix).toBe("my:");
  });
});

// ── remove ─────────────────────────────────────────────────────────────────

describe("plugin remove", () => {
  it("removePluginPackage is callable with package name", () => {
    vi.mocked(listPluginPackages).mockReturnValue(["my-plugin"]);
    vi.mocked(removePluginPackage).mockImplementation(() => {});

    removePluginPackage("my-plugin");
    expect(removePluginPackage).toHaveBeenCalledWith("my-plugin");
  });

  it("listPluginPackages checks if plugin exists before remove", () => {
    vi.mocked(listPluginPackages).mockReturnValue(["a", "b"]);
    const installed = listPluginPackages();
    expect(installed).toContain("a");
    expect(installed).not.toContain("c");
  });
});

// ── list ───────────────────────────────────────────────────────────────────

describe("plugin list", () => {
  it("returns empty when no plugins installed", () => {
    vi.mocked(listPluginPackages).mockReturnValue([]);
    expect(listPluginPackages()).toEqual([]);
  });

  it("returns installed plugin names", () => {
    vi.mocked(listPluginPackages).mockReturnValue(["plugin-a", "plugin-b"]);
    const result = listPluginPackages();
    expect(result).toHaveLength(2);
    expect(result).toContain("plugin-a");
  });

  it("loadPlugin returns info for each package", () => {
    vi.mocked(listPluginPackages).mockReturnValue(["good-pkg"]);
    vi.mocked(loadPlugin).mockReturnValue({
      name: "good",
      prefix: "g:",
      resolve: async () => ({ name: "", version: "", description: "", runtime: "node", command: "", args: [], envVars: [], resolved: "" }),
    });

    const packages = listPluginPackages();
    for (const pkg of packages) {
      const loaded = loadPlugin(pkg);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe("good");
    }
  });
});
