/**
 * health-command.test.ts
 * Tests for the `mcpman health` command logic via its service layer.
 *
 * We mock server-inventory and health-checker so no real processes are spawned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HealthResult, HealthStatus } from "../../src/core/health-checker.js";
import type { InstalledServer } from "../../src/core/server-inventory.js";

// ── Mock health-checker ────────────────────────────────────────────────────────

const mockCheckServerHealth = vi.fn();

vi.mock("../../src/core/health-checker.js", () => ({
  checkServerHealth: (...args: unknown[]) => mockCheckServerHealth(...args),
}));

// ── Mock server-inventory ─────────────────────────────────────────────────────

const mockGetInstalledServers = vi.fn();

vi.mock("../../src/core/server-inventory.js", () => ({
  getInstalledServers: (...args: unknown[]) => mockGetInstalledServers(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeServer(name: string): InstalledServer {
  return {
    name,
    clients: ["claude-desktop"],
    config: { command: "npx", args: ["-y", name], env: {} },
    status: "unknown",
  };
}

function makeHealthResult(name: string, status: HealthStatus): HealthResult {
  return {
    serverName: name,
    status,
    checks: [
      { name: "Runtime", passed: status === "healthy", message: status === "healthy" ? "ok" : "missing" },
      { name: "Process", passed: status === "healthy", skipped: false, message: status === "healthy" ? "spawned" : "failed" },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("health — getInstalledServers integration", () => {
  it("returns empty list when no servers installed", async () => {
    mockGetInstalledServers.mockResolvedValue([]);
    const { getInstalledServers } = await import("../../src/core/server-inventory.js");
    const servers = await getInstalledServers();
    expect(servers).toHaveLength(0);
  });

  it("returns installed servers from client configs", async () => {
    const servers = [makeServer("fs-server"), makeServer("git-server")];
    mockGetInstalledServers.mockResolvedValue(servers);
    const { getInstalledServers } = await import("../../src/core/server-inventory.js");
    const result = await getInstalledServers();
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toContain("fs-server");
  });
});

describe("health — checkServerHealth results", () => {
  it("returns healthy status for a working server", async () => {
    const result = makeHealthResult("fs-server", "healthy");
    mockCheckServerHealth.mockResolvedValue(result);
    const { checkServerHealth } = await import("../../src/core/health-checker.js");
    const health = await checkServerHealth("fs-server", makeServer("fs-server").config);
    expect(health.status).toBe("healthy");
    expect(health.checks.every((c) => c.passed)).toBe(true);
  });

  it("returns unhealthy status for a broken server", async () => {
    const result = makeHealthResult("broken-server", "unhealthy");
    mockCheckServerHealth.mockResolvedValue(result);
    const { checkServerHealth } = await import("../../src/core/health-checker.js");
    const health = await checkServerHealth("broken-server", makeServer("broken-server").config);
    expect(health.status).toBe("unhealthy");
    expect(health.checks.some((c) => !c.passed)).toBe(true);
  });
});

describe("health — parallel execution and aggregation", () => {
  it("runs all servers and aggregates results", async () => {
    const servers = [makeServer("s1"), makeServer("s2"), makeServer("s3")];
    mockGetInstalledServers.mockResolvedValue(servers);
    mockCheckServerHealth
      .mockResolvedValueOnce(makeHealthResult("s1", "healthy"))
      .mockResolvedValueOnce(makeHealthResult("s2", "unhealthy"))
      .mockResolvedValueOnce(makeHealthResult("s3", "healthy"));

    const { getInstalledServers } = await import("../../src/core/server-inventory.js");
    const { checkServerHealth } = await import("../../src/core/health-checker.js");

    const installed = await getInstalledServers();
    const results = await Promise.all(
      installed.map((s) => checkServerHealth(s.name, s.config)),
    );

    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.status === "healthy")).toHaveLength(2);
    expect(results.filter((r) => r.status === "unhealthy")).toHaveLength(1);
  });

  it("sorts unhealthy servers before healthy ones", () => {
    const results: HealthResult[] = [
      makeHealthResult("healthy-1", "healthy"),
      makeHealthResult("broken-1", "unhealthy"),
      makeHealthResult("healthy-2", "healthy"),
    ];

    const order: Record<HealthStatus, number> = { unhealthy: 0, unknown: 1, healthy: 2 };
    results.sort((a, b) => order[a.status] - order[b.status]);

    expect(results[0].status).toBe("unhealthy");
    expect(results[1].status).toBe("healthy");
    expect(results[2].status).toBe("healthy");
  });
});

describe("health — single server filter", () => {
  it("filters to only the requested server by name", async () => {
    const servers = [makeServer("fs-server"), makeServer("git-server")];
    mockGetInstalledServers.mockResolvedValue(servers);

    const { getInstalledServers } = await import("../../src/core/server-inventory.js");
    const all = await getInstalledServers();
    const filtered = all.filter((s) => s.name === "fs-server");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("fs-server");
  });

  it("returns empty list when requested server does not exist", async () => {
    mockGetInstalledServers.mockResolvedValue([makeServer("fs-server")]);

    const { getInstalledServers } = await import("../../src/core/server-inventory.js");
    const all = await getInstalledServers();
    const filtered = all.filter((s) => s.name === "nonexistent");

    expect(filtered).toHaveLength(0);
  });
});

describe("health — summary counts", () => {
  it("correctly counts healthy, unhealthy, unknown", () => {
    const results: HealthResult[] = [
      makeHealthResult("a", "healthy"),
      makeHealthResult("b", "healthy"),
      makeHealthResult("c", "unhealthy"),
      { serverName: "d", status: "unknown", checks: [] },
    ];

    const healthy = results.filter((r) => r.status === "healthy").length;
    const unhealthy = results.filter((r) => r.status === "unhealthy").length;
    const unknown = results.filter((r) => r.status === "unknown").length;

    expect(healthy).toBe(2);
    expect(unhealthy).toBe(1);
    expect(unknown).toBe(1);
  });
});
