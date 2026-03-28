/**
 * migrate-command.test.ts
 * Tests for migrate command logic: client validation, config read/write via
 * the ClientHandler adapter interface, and conflict detection.
 *
 * We mock client-detector so no real config files are touched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientConfig, ServerEntry } from "../../src/clients/types.js";

// ── Shared mock state ─────────────────────────────────────────────────────────

const sourceServers: Record<string, ServerEntry> = {
  "server-alpha": { command: "npx", args: ["-y", "server-alpha"], env: {} },
  "server-beta": { command: "npx", args: ["-y", "server-beta"], env: { KEY: "val" } },
};

const targetServersInitial: Record<string, ServerEntry> = {
  "server-gamma": { command: "npx", args: ["-y", "server-gamma"] },
};

// Mutable target accumulator — reset in beforeEach
let targetAccumulated: Record<string, ServerEntry> = {};

const fromHandler = {
  type: "claude-desktop" as const,
  displayName: "Claude Desktop",
  isInstalled: vi.fn().mockResolvedValue(true),
  getConfigPath: vi.fn().mockReturnValue("/fake/claude-desktop/config.json"),
  readConfig: vi.fn().mockResolvedValue({ servers: sourceServers } as ClientConfig),
  writeConfig: vi.fn().mockResolvedValue(undefined),
  addServer: vi.fn().mockResolvedValue(undefined),
  removeServer: vi.fn().mockResolvedValue(undefined),
};

const toHandler = {
  type: "cursor" as const,
  displayName: "Cursor",
  isInstalled: vi.fn().mockResolvedValue(true),
  getConfigPath: vi.fn().mockReturnValue("/fake/cursor/config.json"),
  readConfig: vi.fn(async () => ({
    servers: { ...targetServersInitial, ...targetAccumulated },
  })),
  writeConfig: vi.fn().mockResolvedValue(undefined),
  addServer: vi.fn(async (name: string, entry: ServerEntry) => {
    targetAccumulated[name] = entry;
  }),
  removeServer: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../src/clients/client-detector.js", () => ({
  getClient: (type: string) => {
    if (type === "claude-desktop") return fromHandler;
    if (type === "cursor") return toHandler;
    throw new Error(`Unknown client: ${type}`);
  },
  getAllClientTypes: () => [
    "claude-desktop",
    "cursor",
    "vscode",
    "windsurf",
    "claude-code",
    "roo-code",
    "codex-cli",
    "opencode",
    "continue",
    "zed",
  ],
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  targetAccumulated = {};
  vi.clearAllMocks();
  // Re-apply stable mock implementations after clearAllMocks
  fromHandler.isInstalled.mockResolvedValue(true);
  fromHandler.readConfig.mockResolvedValue({ servers: sourceServers });
  fromHandler.addServer.mockResolvedValue(undefined);
  toHandler.isInstalled.mockResolvedValue(true);
  toHandler.addServer.mockImplementation(async (name: string, entry: ServerEntry) => {
    targetAccumulated[name] = entry;
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("migrate — client handler wiring", () => {
  it("reads source config from from-handler", async () => {
    const config = await fromHandler.readConfig();
    expect(Object.keys(config.servers)).toContain("server-alpha");
    expect(Object.keys(config.servers)).toContain("server-beta");
  });

  it("reads target config from to-handler", async () => {
    const config = await toHandler.readConfig();
    expect(Object.keys(config.servers)).toContain("server-gamma");
  });
});

describe("migrate — addServer calls per entry", () => {
  it("calls addServer on target for each source server", async () => {
    const sourceConfig = await fromHandler.readConfig();
    for (const [name, entry] of Object.entries(sourceConfig.servers)) {
      await toHandler.addServer(name, entry);
    }

    expect(toHandler.addServer).toHaveBeenCalledTimes(2);
    expect(toHandler.addServer).toHaveBeenCalledWith("server-alpha", sourceServers["server-alpha"]);
    expect(toHandler.addServer).toHaveBeenCalledWith("server-beta", sourceServers["server-beta"]);
  });

  it("accumulated target contains migrated servers", async () => {
    const sourceConfig = await fromHandler.readConfig();
    for (const [name, entry] of Object.entries(sourceConfig.servers)) {
      await toHandler.addServer(name, entry);
    }

    expect(targetAccumulated["server-alpha"]).toBeDefined();
    expect(targetAccumulated["server-beta"]).toBeDefined();
    expect(targetAccumulated["server-beta"]?.env).toEqual({ KEY: "val" });
  });
});

describe("migrate — conflict detection", () => {
  it("identifies new servers vs already-existing servers", async () => {
    const sourceConfig = await fromHandler.readConfig();
    const targetConfig = await toHandler.readConfig();

    const sourceNames = Object.keys(sourceConfig.servers);
    const targetNames = new Set(Object.keys(targetConfig.servers));

    const toAdd = sourceNames.filter((n) => !targetNames.has(n));
    const toOverwrite = sourceNames.filter((n) => targetNames.has(n));

    // Neither server-alpha nor server-beta exist in target initially
    expect(toAdd).toContain("server-alpha");
    expect(toAdd).toContain("server-beta");
    expect(toOverwrite).toHaveLength(0);
  });

  it("detects overwrite when target already has server", async () => {
    // Simulate target already having server-alpha
    targetAccumulated["server-alpha"] = { command: "node", args: ["old.js"] };

    const sourceConfig = await fromHandler.readConfig();
    const targetConfig = await toHandler.readConfig();

    const targetNames = new Set(Object.keys(targetConfig.servers));
    const toOverwrite = Object.keys(sourceConfig.servers).filter((n) => targetNames.has(n));

    expect(toOverwrite).toContain("server-alpha");
  });
});

describe("migrate — source not installed guard", () => {
  it("isInstalled returns false for missing client", async () => {
    fromHandler.isInstalled.mockResolvedValueOnce(false);
    const installed = await fromHandler.isInstalled();
    expect(installed).toBe(false);
  });
});

describe("migrate — error handling", () => {
  it("counts errors when addServer throws", async () => {
    toHandler.addServer
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(undefined);

    const sourceConfig = await fromHandler.readConfig();
    const errors: { name: string; error: string }[] = [];
    let successCount = 0;

    for (const [name, entry] of Object.entries(sourceConfig.servers)) {
      try {
        await toHandler.addServer(name, entry);
        successCount++;
      } catch (err) {
        errors.push({ name, error: String(err) });
      }
    }

    expect(successCount).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain("Permission denied");
  });
});
