/**
 * Unit tests for src/core/server-updater.ts
 * Tests applyServerUpdate() — the shared update logic used by both
 * `mcpman update` and `mcpman audit --fix`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LockEntry } from "../../src/core/lockfile.js";
import type { ClientHandler } from "../../src/clients/types.js";

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock lockfile addEntry so tests do not write to disk
vi.mock("../../src/core/lockfile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/lockfile.js")>();
  return {
    ...actual,
    addEntry: vi.fn(),
  };
});

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeLockEntry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    version: "1.0.0",
    source: "npm",
    resolved: "https://registry.npmjs.org/test-pkg/-/test-pkg-1.0.0.tgz",
    integrity: "sha512-old",
    runtime: "node",
    command: "npx",
    args: ["-y", "test-pkg@1.0.0"],
    envVars: [],
    installedAt: new Date().toISOString(),
    clients: ["claude-desktop"],
    ...overrides,
  };
}

function makeClient(type: ClientHandler["type"] = "claude-desktop"): ClientHandler {
  return {
    type,
    displayName: type,
    isInstalled: vi.fn().mockResolvedValue(true),
    getConfigPath: vi.fn().mockReturnValue(`/tmp/${type}-config.json`),
    readConfig: vi.fn().mockResolvedValue({ servers: {} }),
    writeConfig: vi.fn().mockResolvedValue(undefined),
    addServer: vi.fn().mockResolvedValue(undefined),
    removeServer: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── applyServerUpdate ───────────────────────────────────────────────────────

describe("applyServerUpdate()", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("success path: returns correct from/to versions", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      version: "2.0.0",
      name: "test-pkg",
      description: "",
      command: "npx",
      args: ["-y", "test-pkg@2.0.0"],
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry();
    const result = await applyServerUpdate("test-pkg", entry, []);

    expect(result.success).toBe(true);
    expect(result.server).toBe("test-pkg");
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("2.0.0");
    expect(result.error).toBeUndefined();
  });

  it("success path: calls addEntry to update lockfile", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      version: "1.5.0",
      name: "test-pkg",
      description: "",
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const { addEntry } = await import("../../src/core/lockfile.js");
    const entry = makeLockEntry();
    await applyServerUpdate("test-pkg", entry, []);

    expect(addEntry).toHaveBeenCalledWith(
      "test-pkg",
      expect.objectContaining({ version: "1.5.0" })
    );
  });

  it("success path: calls addServer on matching clients", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      version: "2.0.0",
      name: "test-pkg",
      description: "",
      command: "npx",
      args: ["-y", "test-pkg@2.0.0"],
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry({ clients: ["claude-desktop"] });
    const claudeClient = makeClient("claude-desktop");
    const cursorClient = makeClient("cursor");

    await applyServerUpdate("test-pkg", entry, [claudeClient, cursorClient]);

    // Only claude-desktop is in lockEntry.clients
    expect(claudeClient.addServer).toHaveBeenCalledOnce();
    expect(cursorClient.addServer).not.toHaveBeenCalled();
  });

  it("failure path: returns error result when resolveServer throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Cannot reach npm registry: Network error"));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry();
    const result = await applyServerUpdate("test-pkg", entry, []);

    expect(result.success).toBe(false);
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("1.0.0"); // unchanged on failure
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("failure path: does not throw even when registry is down", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry();

    // Should resolve (not reject) — error is captured in result
    await expect(applyServerUpdate("test-pkg", entry, [])).resolves.toMatchObject({
      success: false,
    });
  });

  it("client addServer failure is non-fatal: result.success is still true", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      version: "3.0.0",
      name: "test-pkg",
      description: "",
      command: "npx",
      args: ["-y", "test-pkg@3.0.0"],
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry({ clients: ["claude-desktop"] });
    const faultyClient = makeClient("claude-desktop");
    // Simulate client config write failure
    (faultyClient.addServer as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Config write failed")
    );

    const result = await applyServerUpdate("test-pkg", entry, [faultyClient]);

    // Lockfile was updated; client failure is non-fatal
    expect(result.success).toBe(true);
    expect(result.toVersion).toBe("3.0.0");
  });

  it("smithery source: resolves with smithery: prefix", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({
      version: "1.2.0",
      command: "npx",
      args: ["-y", "smithery-server@1.2.0"],
      resolved: "smithery:smithery-server@1.2.0",
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry({
      source: "smithery",
      resolved: "smithery:smithery-server@1.0.0",
    });

    const result = await applyServerUpdate("smithery-server", entry, []);

    // Verify that the URL used contained smithery registry
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("registry.smithery.ai");
    expect(result.success).toBe(true);
  });

  it("github source: resolves using lockEntry.resolved as input", async () => {
    // GitHub source: fetch package.json from raw.githubusercontent.com
    mockFetch.mockResolvedValueOnce(makeResponse({
      name: "owner/repo",
      version: "2.0.0",
    }));

    const { applyServerUpdate } = await import("../../src/core/server-updater.js");
    const entry = makeLockEntry({
      source: "github",
      resolved: "https://github.com/owner/repo",
      version: "1.0.0",
    });

    const result = await applyServerUpdate("owner/repo", entry, []);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("githubusercontent.com");
    // github resolver is best-effort and may succeed or fall back to defaults
    expect(result.server).toBe("owner/repo");
  });
});
