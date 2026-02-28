/**
 * config-differ.test.ts
 * Unit tests for diffClientConfigs() — added/removed/changed logic.
 */

import { describe, expect, it } from "vitest";
import type { ClientConfig } from "../../src/clients/types.js";
import { diffClientConfigs } from "../../src/core/config-differ.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function cfg(servers: ClientConfig["servers"]): ClientConfig {
  return { servers };
}

function entry(command = "npx", args: string[] = [], env?: Record<string, string>) {
  return { command, args, ...(env ? { env } : {}) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("diffClientConfigs — identical configs", () => {
  it("returns empty array when configs are identical", () => {
    const a = cfg({ "server-a": entry("npx", ["-y", "pkg"]) });
    const b = cfg({ "server-a": entry("npx", ["-y", "pkg"]) });
    expect(diffClientConfigs(a, b)).toEqual([]);
  });

  it("returns empty array for two empty configs", () => {
    expect(diffClientConfigs(cfg({}), cfg({}))).toEqual([]);
  });
});

describe("diffClientConfigs — added servers", () => {
  it("detects server present in B but not A as added", () => {
    const a = cfg({});
    const b = cfg({ "new-server": entry("node", ["server.js"]) });
    const result = diffClientConfigs(a, b);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ server: "new-server", change: "added" });
  });

  it("detects multiple added servers", () => {
    const a = cfg({ shared: entry() });
    const b = cfg({ shared: entry(), extra1: entry(), extra2: entry() });
    const added = diffClientConfigs(a, b).filter((d) => d.change === "added");
    expect(added).toHaveLength(2);
    const names = added.map((d) => d.server).sort();
    expect(names).toEqual(["extra1", "extra2"]);
  });
});

describe("diffClientConfigs — removed servers", () => {
  it("detects server present in A but not B as removed", () => {
    const a = cfg({ "old-server": entry() });
    const b = cfg({});
    const result = diffClientConfigs(a, b);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ server: "old-server", change: "removed" });
  });
});

describe("diffClientConfigs — changed servers", () => {
  it("detects changed command", () => {
    const a = cfg({ srv: entry("npx") });
    const b = cfg({ srv: entry("uvx") });
    const result = diffClientConfigs(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].change).toBe("changed");
    expect(result[0].details?.some((d) => d.includes("command"))).toBe(true);
  });

  it("detects changed args", () => {
    const a = cfg({ srv: entry("npx", ["-y", "pkg@1"]) });
    const b = cfg({ srv: entry("npx", ["-y", "pkg@2"]) });
    const result = diffClientConfigs(a, b);
    expect(result[0].change).toBe("changed");
    expect(result[0].details?.some((d) => d.includes("args"))).toBe(true);
  });

  it("detects changed env", () => {
    const a = cfg({ srv: entry("npx", [], { API_KEY: "old" }) });
    const b = cfg({ srv: entry("npx", [], { API_KEY: "new" }) });
    const result = diffClientConfigs(a, b);
    expect(result[0].change).toBe("changed");
    expect(result[0].details?.some((d) => d.includes("env"))).toBe(true);
  });

  it("treats missing args as empty array (no change)", () => {
    const a = cfg({ srv: { command: "npx" } });
    const b = cfg({ srv: { command: "npx", args: [] } });
    expect(diffClientConfigs(a, b)).toEqual([]);
  });
});

describe("diffClientConfigs — mixed diffs", () => {
  it("handles all three change types together", () => {
    const a = cfg({
      shared: entry("npx", ["v1"]),
      "only-in-a": entry(),
    });
    const b = cfg({
      shared: entry("npx", ["v2"]),
      "only-in-b": entry(),
    });
    const result = diffClientConfigs(a, b);
    const changes = Object.fromEntries(result.map((d) => [d.server, d.change]));
    expect(changes["only-in-b"]).toBe("added");
    expect(changes["only-in-a"]).toBe("removed");
    expect(changes["shared"]).toBe("changed");
  });

  it("sort order is: removed, added, changed", () => {
    const a = cfg({ removed: entry("a"), changed: entry("x") });
    const b = cfg({ added: entry("b"), changed: entry("y") });
    const result = diffClientConfigs(a, b);
    const order = result.map((d) => d.change);
    const removedIdx = order.indexOf("removed");
    const addedIdx = order.indexOf("added");
    const changedIdx = order.indexOf("changed");
    expect(removedIdx).toBeLessThan(addedIdx);
    expect(addedIdx).toBeLessThan(changedIdx);
  });
});
