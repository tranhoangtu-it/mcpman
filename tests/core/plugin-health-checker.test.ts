/**
 * plugin-health-checker.test.ts
 * Unit tests for checkPluginHealth().
 * Mocks listPluginPackages and loadPlugin from plugin-loader.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock plugin-loader before importing plugin-health-checker
vi.mock("../../src/core/plugin-loader.js", () => ({
  listPluginPackages: vi.fn(),
  loadPlugin: vi.fn(),
  loadAllPlugins: vi.fn().mockReturnValue([]),
}));

import { checkPluginHealth } from "../../src/core/plugin-health-checker.js";
import { listPluginPackages, loadPlugin } from "../../src/core/plugin-loader.js";

function makePlugin(overrides: {
  name?: string;
  prefix?: string;
  resolve?: unknown;
} = {}) {
  return {
    name: overrides.name ?? "test-registry",
    prefix: overrides.prefix ?? "test:",
    resolve: overrides.resolve !== undefined ? overrides.resolve : async () => ({}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── empty plugins ──────────────────────────────────────────────────────────────

describe("checkPluginHealth() — no plugins", () => {
  it("returns zero counts when no plugins registered", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const summary = checkPluginHealth();

    expect(summary.total).toBe(0);
    expect(summary.healthy).toBe(0);
    expect(summary.unhealthy).toBe(0);
    expect(summary.results).toEqual([]);
  });
});

// ── healthy plugin ─────────────────────────────────────────────────────────────

describe("checkPluginHealth() — healthy plugin", () => {
  it("reports healthy when plugin loads correctly", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue(["good-plugin"]);
    (loadPlugin as ReturnType<typeof vi.fn>).mockReturnValue(makePlugin());

    const summary = checkPluginHealth();

    expect(summary.total).toBe(1);
    expect(summary.healthy).toBe(1);
    expect(summary.unhealthy).toBe(0);

    const result = summary.results[0];
    expect(result.packageName).toBe("good-plugin");
    expect(result.loadable).toBe(true);
    expect(result.prefixUnique).toBe(true);
    expect(result.resolvable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("reports plugin name and prefix correctly", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue(["my-pkg"]);
    (loadPlugin as ReturnType<typeof vi.fn>).mockReturnValue(
      makePlugin({ name: "my-registry", prefix: "my:" }),
    );

    const summary = checkPluginHealth();

    expect(summary.results[0].pluginName).toBe("my-registry");
    expect(summary.results[0].prefix).toBe("my:");
  });
});

// ── unloadable plugin ──────────────────────────────────────────────────────────

describe("checkPluginHealth() — unloadable plugin", () => {
  it("reports unhealthy when loadPlugin returns null", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue(["bad-pkg"]);
    (loadPlugin as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const summary = checkPluginHealth();

    expect(summary.total).toBe(1);
    expect(summary.healthy).toBe(0);
    expect(summary.unhealthy).toBe(1);

    const result = summary.results[0];
    expect(result.loadable).toBe(false);
    expect(result.prefixUnique).toBe(false);
    expect(result.resolvable).toBe(false);
    expect(result.pluginName).toBeNull();
    expect(result.prefix).toBeNull();
    expect(result.error).toMatch(/failed to load/i);
  });
});

// ── duplicate prefix ───────────────────────────────────────────────────────────

describe("checkPluginHealth() — duplicate prefix", () => {
  it("marks both plugins as non-unique when prefixes collide", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue([
      "plugin-a",
      "plugin-b",
    ]);
    (loadPlugin as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makePlugin({ name: "registry-a", prefix: "shared:" }))
      .mockReturnValueOnce(makePlugin({ name: "registry-b", prefix: "shared:" }));

    const summary = checkPluginHealth();

    expect(summary.total).toBe(2);
    expect(summary.healthy).toBe(0);
    expect(summary.unhealthy).toBe(2);

    for (const result of summary.results) {
      expect(result.prefixUnique).toBe(false);
      expect(result.error).toMatch(/conflicts/i);
    }
  });

  it("marks only plugins with unique prefixes as healthy", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue([
      "plugin-a",
      "plugin-b",
      "plugin-c",
    ]);
    (loadPlugin as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makePlugin({ name: "a", prefix: "dup:" }))
      .mockReturnValueOnce(makePlugin({ name: "b", prefix: "dup:" }))
      .mockReturnValueOnce(makePlugin({ name: "c", prefix: "unique:" }));

    const summary = checkPluginHealth();

    expect(summary.total).toBe(3);
    expect(summary.healthy).toBe(1);
    expect(summary.unhealthy).toBe(2);

    const uniqueResult = summary.results.find((r) => r.prefix === "unique:");
    expect(uniqueResult?.prefixUnique).toBe(true);
  });
});

// ── mixed scenario ─────────────────────────────────────────────────────────────

describe("checkPluginHealth() — mixed results", () => {
  it("handles a mix of healthy and unhealthy plugins", () => {
    (listPluginPackages as ReturnType<typeof vi.fn>).mockReturnValue([
      "ok-plugin",
      "missing-plugin",
    ]);
    (loadPlugin as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(makePlugin({ name: "ok", prefix: "ok:" }))
      .mockReturnValueOnce(null);

    const summary = checkPluginHealth();

    expect(summary.total).toBe(2);
    expect(summary.healthy).toBe(1);
    expect(summary.unhealthy).toBe(1);
  });
});
