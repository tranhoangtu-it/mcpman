/**
 * sync.test.ts
 * Tests for config-diff and sync-engine logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClientConfig, ClientHandler, ClientType, ServerEntry } from "../src/clients/types.js";
import type { LockfileData } from "../src/core/lockfile.js";
import {
  computeDiff,
  computeDiffFromClient,
  reconstructServerEntry,
} from "../src/core/config-diff.js";
import { applySyncActions } from "../src/core/sync-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLockfile(servers: LockfileData["servers"] = {}): LockfileData {
  return { lockfileVersion: 1, servers };
}

function makeLockEntry(overrides: Partial<LockfileData["servers"][string]> = {}) {
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
    clients: ["claude-desktop"] as ClientType[],
    ...overrides,
  };
}

function makeConfig(servers: Record<string, ServerEntry> = {}): ClientConfig {
  return { servers };
}

function makeHandler(type: ClientType, addServerFn = vi.fn()): ClientHandler {
  return {
    type,
    displayName: type,
    isInstalled: vi.fn(async () => true),
    getConfigPath: vi.fn(() => `/fake/${type}/config.json`),
    readConfig: vi.fn(async () => makeConfig()),
    writeConfig: vi.fn(async () => {}),
    addServer: addServerFn,
    removeServer: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// reconstructServerEntry
// ---------------------------------------------------------------------------

describe("reconstructServerEntry()", () => {
  it("reconstructs basic entry from lock entry", () => {
    const lock = makeLockEntry({ command: "npx", args: ["-y", "foo"] });
    const entry = reconstructServerEntry(lock);
    expect(entry.command).toBe("npx");
    expect(entry.args).toEqual(["-y", "foo"]);
  });

  it("omits args when empty", () => {
    const lock = makeLockEntry({ args: [] });
    const entry = reconstructServerEntry(lock);
    expect(entry.args).toBeUndefined();
  });

  it("adds env placeholder keys when envVars present", () => {
    const lock = makeLockEntry({ envVars: ["TOKEN", "API_KEY"] });
    const entry = reconstructServerEntry(lock);
    expect(entry.env).toEqual({ TOKEN: "", API_KEY: "" });
  });

  it("omits env when envVars empty", () => {
    const lock = makeLockEntry({ envVars: [] });
    const entry = reconstructServerEntry(lock);
    expect(entry.env).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeDiff — lockfile as source
// ---------------------------------------------------------------------------

describe("computeDiff()", () => {
  it("detects missing server in client config as 'add'", () => {
    const lockfile = makeLockfile({
      "my-server": makeLockEntry({ clients: ["claude-desktop"] }),
    });
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig()], // empty — server missing
    ]);

    const actions = computeDiff(lockfile, configs);
    const adds = actions.filter((a) => a.action === "add");
    expect(adds).toHaveLength(1);
    expect(adds[0].server).toBe("my-server");
    expect(adds[0].client).toBe("claude-desktop");
  });

  it("detects server present in both as 'ok'", () => {
    const lockfile = makeLockfile({
      "my-server": makeLockEntry({ clients: ["cursor"] }),
    });
    const configs = new Map<ClientType, ClientConfig>([
      ["cursor", makeConfig({ "my-server": { command: "npx", args: ["-y", "foo"] } })],
    ]);

    const actions = computeDiff(lockfile, configs);
    const ok = actions.filter((a) => a.action === "ok");
    expect(ok).toHaveLength(1);
    expect(ok[0].server).toBe("my-server");
  });

  it("detects server in client but not in lockfile as 'extra'", () => {
    const lockfile = makeLockfile({}); // empty lockfile
    const configs = new Map<ClientType, ClientConfig>([
      ["vscode", makeConfig({ "orphan-server": { command: "node", args: ["server.js"] } })],
    ]);

    const actions = computeDiff(lockfile, configs);
    const extras = actions.filter((a) => a.action === "extra");
    expect(extras).toHaveLength(1);
    expect(extras[0].server).toBe("orphan-server");
    expect(extras[0].client).toBe("vscode");
  });

  it("handles empty lockfile and empty configs — no actions", () => {
    const actions = computeDiff(makeLockfile(), new Map());
    expect(actions).toHaveLength(0);
  });

  it("skips client not present in configs map (not installed)", () => {
    const lockfile = makeLockfile({
      "my-server": makeLockEntry({ clients: ["windsurf"] }),
    });
    // windsurf NOT in configs map — should be silently skipped
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig()],
    ]);

    const actions = computeDiff(lockfile, configs);
    const forWindsurf = actions.filter((a) => a.client === "windsurf");
    expect(forWindsurf).toHaveLength(0);
  });

  it("handles multiple clients with different states for same server", () => {
    const lockfile = makeLockfile({
      "my-server": makeLockEntry({ clients: ["claude-desktop", "cursor"] }),
    });
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig({ "my-server": { command: "npx" } })], // present
      ["cursor", makeConfig()], // missing
    ]);

    const actions = computeDiff(lockfile, configs);
    const ok = actions.filter((a) => a.action === "ok");
    const adds = actions.filter((a) => a.action === "add");
    expect(ok).toHaveLength(1);
    expect(adds).toHaveLength(1);
    expect(adds[0].client).toBe("cursor");
  });
});

// ---------------------------------------------------------------------------
// computeDiffFromClient — specific client as source
// ---------------------------------------------------------------------------

describe("computeDiffFromClient()", () => {
  it("returns empty array when source client not in configs", () => {
    const configs = new Map<ClientType, ClientConfig>();
    const actions = computeDiffFromClient("cursor", configs);
    expect(actions).toHaveLength(0);
  });

  it("detects missing server in target client as 'add'", () => {
    const sourceEntry: ServerEntry = { command: "npx", args: ["-y", "foo"] };
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig({ "my-server": sourceEntry })],
      ["cursor", makeConfig()], // missing
    ]);

    const actions = computeDiffFromClient("claude-desktop", configs);
    const adds = actions.filter((a) => a.action === "add");
    expect(adds).toHaveLength(1);
    expect(adds[0].server).toBe("my-server");
    expect(adds[0].client).toBe("cursor");
    expect(adds[0].entry).toEqual(sourceEntry);
  });

  it("detects server in target not in source as 'extra'", () => {
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig()], // source is empty
      ["cursor", makeConfig({ "extra-server": { command: "node" } })],
    ]);

    const actions = computeDiffFromClient("claude-desktop", configs);
    const extras = actions.filter((a) => a.action === "extra");
    expect(extras).toHaveLength(1);
    expect(extras[0].server).toBe("extra-server");
  });

  it("marks server present in both as 'ok'", () => {
    const entry: ServerEntry = { command: "npx" };
    const configs = new Map<ClientType, ClientConfig>([
      ["claude-desktop", makeConfig({ "shared-server": entry })],
      ["cursor", makeConfig({ "shared-server": entry })],
    ]);

    const actions = computeDiffFromClient("claude-desktop", configs);
    const ok = actions.filter((a) => a.action === "ok");
    expect(ok).toHaveLength(1);
    expect(ok[0].server).toBe("shared-server");
  });
});

// ---------------------------------------------------------------------------
// applySyncActions
// ---------------------------------------------------------------------------

describe("applySyncActions()", () => {
  it("calls addServer for 'add' actions and returns applied count", async () => {
    const addServer = vi.fn(async () => {});
    const handler = makeHandler("claude-desktop", addServer);
    const handlers = new Map<ClientType, ClientHandler>([["claude-desktop", handler]]);

    const actions = [
      {
        server: "my-server",
        client: "claude-desktop" as ClientType,
        action: "add" as const,
        entry: { command: "npx", args: ["-y", "foo"] },
      },
    ];

    const result = await applySyncActions(actions, handlers);
    expect(addServer).toHaveBeenCalledOnce();
    expect(addServer).toHaveBeenCalledWith("my-server", { command: "npx", args: ["-y", "foo"] });
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("skips 'extra' and 'ok' actions", async () => {
    const addServer = vi.fn(async () => {});
    const handler = makeHandler("cursor", addServer);
    const handlers = new Map<ClientType, ClientHandler>([["cursor", handler]]);

    const actions = [
      { server: "s1", client: "cursor" as ClientType, action: "extra" as const },
      { server: "s2", client: "cursor" as ClientType, action: "ok" as const },
    ];

    const result = await applySyncActions(actions, handlers);
    expect(addServer).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("records failure when addServer throws", async () => {
    const addServer = vi.fn(async () => { throw new Error("write failed"); });
    const handler = makeHandler("vscode", addServer);
    const handlers = new Map<ClientType, ClientHandler>([["vscode", handler]]);

    const actions = [
      {
        server: "bad-server",
        client: "vscode" as ClientType,
        action: "add" as const,
        entry: { command: "npx" },
      },
    ];

    const result = await applySyncActions(actions, handlers);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].server).toBe("bad-server");
    expect(result.errors[0].error).toContain("write failed");
  });

  it("records failure when handler not found for client", async () => {
    const handlers = new Map<ClientType, ClientHandler>(); // empty

    const actions = [
      {
        server: "my-server",
        client: "windsurf" as ClientType,
        action: "add" as const,
        entry: { command: "npx" },
      },
    ];

    const result = await applySyncActions(actions, handlers);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles empty actions array gracefully", async () => {
    const handlers = new Map<ClientType, ClientHandler>();
    const result = await applySyncActions([], handlers);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
