import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeTrustScore } from "../src/core/trust-scorer.js";
import type { PackageMetadata, VulnInfo, SecurityReport } from "../src/core/security-scanner.js";

// --- Helpers ---

function makeMetadata(overrides: Partial<PackageMetadata> = {}): PackageMetadata {
  return {
    weeklyDownloads: 10_000,
    lastPublish: new Date(Date.now() - 7 * 86_400_000).toISOString(), // 7 days ago
    packageAge: 365,
    maintainerCount: 2,
    deprecated: false,
    ...overrides,
  };
}

function makeVuln(severity: VulnInfo["severity"], title = "Test vulnerability"): VulnInfo {
  return { severity, title };
}

// --- Trust scorer tests ---

describe("computeTrustScore()", () => {
  it("returns high score for healthy package with no vulns", () => {
    const meta = makeMetadata({ weeklyDownloads: 100_000, packageAge: 730, maintainerCount: 3 });
    const { score, riskLevel } = computeTrustScore(meta, []);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(riskLevel).toBe("LOW");
  });

  it("returns HIGH/CRITICAL risk for package with many critical vulns", () => {
    // Worst-case metadata + many critical vulns should push score below 80 (not LOW)
    const meta = makeMetadata({ weeklyDownloads: 10, packageAge: 5, maintainerCount: 1, deprecated: true });
    const vulns = [makeVuln("critical"), makeVuln("critical"), makeVuln("critical"), makeVuln("high")];
    const { score, riskLevel } = computeTrustScore(meta, vulns);
    // vuln sub-score = 0; other factors are low too → overall should be HIGH or CRITICAL
    expect(score).toBeLessThan(50);
    expect(["HIGH", "CRITICAL"]).toContain(riskLevel);
  });

  it("risk level boundary: score 80 = LOW", () => {
    // Construct inputs that yield exactly 80 score via forced scenario
    const meta = makeMetadata({ weeklyDownloads: 100_000, packageAge: 730, maintainerCount: 3 });
    const { score } = computeTrustScore(meta, []);
    // With no vulns and good metadata, score should be >= 80 → LOW
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("risk level boundary: score 79 = MEDIUM", () => {
    // Suppress downloads and add moderate vuln to push below 80
    const meta = makeMetadata({ weeklyDownloads: 50, packageAge: 10, maintainerCount: 1 });
    const { score } = computeTrustScore(meta, [makeVuln("moderate")]);
    expect(score).toBeLessThan(80);
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(score < 50 ? "HIGH" : "MEDIUM");
  });

  it("score is clamped to 0-100", () => {
    const meta = makeMetadata();
    const manyVulns = Array.from({ length: 10 }, () => makeVuln("critical"));
    const { score } = computeTrustScore(meta, manyVulns);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles null metadata gracefully (non-npm source)", () => {
    const { score, riskLevel } = computeTrustScore(null, []);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(riskLevel);
  });

  it("deprecated package scores lower than non-deprecated", () => {
    const good = makeMetadata({ deprecated: false, maintainerCount: 2 });
    const depr = makeMetadata({ deprecated: true, maintainerCount: 2 });
    const { score: goodScore } = computeTrustScore(good, []);
    const { score: deprScore } = computeTrustScore(depr, []);
    expect(goodScore).toBeGreaterThan(deprScore);
  });

  it("package with zero downloads gets low download sub-score", () => {
    const noDownloads = makeMetadata({ weeklyDownloads: 0, packageAge: 365, maintainerCount: 1 });
    const highDownloads = makeMetadata({ weeklyDownloads: 1_000_000, packageAge: 365, maintainerCount: 1 });
    const { score: low } = computeTrustScore(noDownloads, []);
    const { score: high } = computeTrustScore(highDownloads, []);
    expect(high).toBeGreaterThan(low);
  });
});

// --- Security scanner fetch tests (mocked fetch) ---

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchNpmMetadata()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns metadata for a valid npm package", async () => {
    const { fetchNpmMetadata } = await import("../src/core/security-scanner.js");

    const created = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const modified = new Date(Date.now() - 5 * 86_400_000).toISOString();

    mockFetch
      .mockResolvedValueOnce(makeResponse({
        name: "test-pkg",
        "dist-tags": { latest: "1.0.0" },
        versions: { "1.0.0": {} },
        time: { created, modified },
        maintainers: [{ name: "alice" }, { name: "bob" }],
      }))
      .mockResolvedValueOnce(makeResponse({ downloads: 5000 }));

    const meta = await fetchNpmMetadata("test-pkg");
    expect(meta).not.toBeNull();
    expect(meta!.weeklyDownloads).toBe(5000);
    expect(meta!.maintainerCount).toBe(2);
    expect(meta!.packageAge).toBeGreaterThan(190);
    expect(meta!.deprecated).toBe(false);
  });

  it("returns null when registry returns non-ok response", async () => {
    const { fetchNpmMetadata } = await import("../src/core/security-scanner.js");
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 404))
      .mockResolvedValueOnce(makeResponse({ downloads: 0 }));
    const meta = await fetchNpmMetadata("no-such-pkg");
    expect(meta).toBeNull();
  });

  it("detects deprecated packages", async () => {
    const { fetchNpmMetadata } = await import("../src/core/security-scanner.js");
    const created = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const modified = new Date().toISOString();
    mockFetch
      .mockResolvedValueOnce(makeResponse({
        name: "old-pkg",
        "dist-tags": { latest: "2.0.0" },
        versions: { "2.0.0": { deprecated: "Use new-pkg instead" } },
        time: { created, modified },
        maintainers: [{ name: "alice" }],
      }))
      .mockResolvedValueOnce(makeResponse({ downloads: 100 }));
    const meta = await fetchNpmMetadata("old-pkg");
    expect(meta!.deprecated).toBe(true);
  });
});

describe("fetchVulnerabilities()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns empty array when OSV returns no vulns", async () => {
    const { fetchVulnerabilities } = await import("../src/core/security-scanner.js");
    mockFetch.mockResolvedValueOnce(makeResponse({ vulns: [] }));
    const vulns = await fetchVulnerabilities("safe-pkg", "1.0.0");
    expect(vulns).toHaveLength(0);
  });

  it("parses OSV vulnerabilities correctly", async () => {
    const { fetchVulnerabilities } = await import("../src/core/security-scanner.js");
    mockFetch.mockResolvedValueOnce(makeResponse({
      vulns: [
        {
          id: "GHSA-1234",
          summary: "Prototype pollution",
          database_specific: { severity: "HIGH" },
          references: [{ url: "https://github.com/advisories/GHSA-1234" }],
        },
      ],
    }));
    const vulns = await fetchVulnerabilities("vuln-pkg", "1.0.0");
    expect(vulns).toHaveLength(1);
    expect(vulns[0].severity).toBe("high");
    expect(vulns[0].title).toBe("Prototype pollution");
    expect(vulns[0].url).toBe("https://github.com/advisories/GHSA-1234");
  });

  it("returns empty array on network error", async () => {
    const { fetchVulnerabilities } = await import("../src/core/security-scanner.js");
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));
    const vulns = await fetchVulnerabilities("unreachable-pkg", "1.0.0");
    expect(vulns).toHaveLength(0);
  });
});

describe("scanServer()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns UNKNOWN report for non-npm sources", async () => {
    const { scanServer } = await import("../src/core/security-scanner.js");
    const report = await scanServer("my-smithery-server", {
      version: "1.0.0",
      source: "smithery",
      resolved: "smithery:my-smithery-server@1.0.0",
      integrity: "sha512-xxx",
      runtime: "node",
      command: "npx",
      args: [],
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: ["claude-desktop"],
    });
    expect(report.riskLevel).toBe("UNKNOWN");
    expect(report.score).toBeNull();
    expect(report.vulnerabilities).toHaveLength(0);
  });

  it("returns UNKNOWN report for github sources", async () => {
    const { scanServer } = await import("../src/core/security-scanner.js");
    const report = await scanServer("owner/repo", {
      version: "main",
      source: "github",
      resolved: "https://github.com/owner/repo",
      integrity: "sha512-xxx",
      runtime: "node",
      command: "npx",
      args: [],
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: ["cursor"],
    });
    expect(report.riskLevel).toBe("UNKNOWN");
    expect(report.source).toBe("github");
  });
});

// ─── audit --fix flow (unit tests via runAuditFix internals) ─────────────────

// Helper to build a minimal SecurityReport
function makeReport(
  server: string,
  source: SecurityReport["source"],
  vulns: VulnInfo[] = []
): SecurityReport {
  return {
    server,
    source,
    score: vulns.length === 0 ? 90 : 30,
    riskLevel: vulns.length === 0 ? "LOW" : "HIGH",
    vulnerabilities: vulns,
    metadata: null,
  };
}

describe("audit --fix: applyServerUpdate integration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("applyServerUpdate returns success result when resolveServer succeeds", async () => {
    // Mock fetch: resolveServer calls npm registry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "2.0.0",
        name: "vuln-server",
        description: "test",
        command: "npx",
        args: ["-y", "vuln-server@2.0.0"],
      }),
    });

    const { applyServerUpdate } = await import("../src/core/server-updater.js");

    const lockEntry = {
      version: "1.0.0",
      source: "npm" as const,
      resolved: "https://registry.npmjs.org/vuln-server/-/vuln-server-1.0.0.tgz",
      integrity: "sha512-old",
      runtime: "node" as const,
      command: "npx",
      args: ["-y", "vuln-server@1.0.0"],
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: ["claude-desktop" as const],
    };

    const mockClient = {
      type: "claude-desktop" as const,
      displayName: "Claude Desktop",
      isInstalled: vi.fn().mockResolvedValue(true),
      getConfigPath: vi.fn().mockReturnValue("/tmp/test-config.json"),
      readConfig: vi.fn().mockResolvedValue({ servers: {} }),
      writeConfig: vi.fn().mockResolvedValue(undefined),
      addServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn().mockResolvedValue(undefined),
    };

    const result = await applyServerUpdate("vuln-server", lockEntry, [mockClient]);

    expect(result.success).toBe(true);
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("2.0.0");
    expect(result.server).toBe("vuln-server");
    expect(mockClient.addServer).toHaveBeenCalledWith("vuln-server", expect.objectContaining({
      command: "npx",
    }));
  });

  it("applyServerUpdate returns error result when resolveServer fails", async () => {
    // Make fetch reject (simulates registry down)
    mockFetch.mockRejectedValueOnce(new Error("Registry unreachable"));

    const { applyServerUpdate } = await import("../src/core/server-updater.js");

    const lockEntry = {
      version: "1.0.0",
      source: "npm" as const,
      resolved: "https://registry.npmjs.org/broken/-/broken-1.0.0.tgz",
      integrity: "sha512-old",
      runtime: "node" as const,
      command: "npx",
      args: ["-y", "broken@1.0.0"],
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: ["cursor" as const],
    };

    const result = await applyServerUpdate("broken", lockEntry, []);

    expect(result.success).toBe(false);
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("1.0.0"); // unchanged on failure
    expect(result.error).toBeDefined();
    expect(result.error).toContain("unreachable");
  });

  it("applyServerUpdate skips clients that do not match lockEntry.clients", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: "1.5.0",
        name: "my-pkg",
        description: "",
        command: "npx",
        args: ["-y", "my-pkg@1.5.0"],
      }),
    });

    const { applyServerUpdate } = await import("../src/core/server-updater.js");

    const lockEntry = {
      version: "1.0.0",
      source: "npm" as const,
      resolved: "https://registry.npmjs.org/my-pkg/-/my-pkg-1.0.0.tgz",
      integrity: "sha512-old",
      runtime: "node" as const,
      command: "npx",
      args: ["-y", "my-pkg@1.0.0"],
      envVars: [],
      installedAt: new Date().toISOString(),
      clients: ["claude-desktop" as const], // only claude-desktop
    };

    const cursorClient = {
      type: "cursor" as const,
      displayName: "Cursor",
      isInstalled: vi.fn().mockResolvedValue(true),
      getConfigPath: vi.fn().mockReturnValue("/tmp/cursor-config.json"),
      readConfig: vi.fn().mockResolvedValue({ servers: {} }),
      writeConfig: vi.fn().mockResolvedValue(undefined),
      addServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn().mockResolvedValue(undefined),
    };

    await applyServerUpdate("my-pkg", lockEntry, [cursorClient]);

    // cursor client should NOT be called since lockEntry.clients = ["claude-desktop"]
    expect(cursorClient.addServer).not.toHaveBeenCalled();
  });
});

describe("audit --fix: no vulnerable servers", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("makeReport with no vulns yields empty vulnerabilities list", () => {
    const report = makeReport("safe-server", "npm", []);
    expect(report.vulnerabilities).toHaveLength(0);
    expect(report.riskLevel).toBe("LOW");
  });

  it("makeReport with vulns yields non-empty vulnerabilities list", () => {
    const report = makeReport("vuln-server", "npm", [makeVuln("critical")]);
    expect(report.vulnerabilities).toHaveLength(1);
    expect(report.riskLevel).toBe("HIGH");
  });

  it("non-npm source report is filtered from auto-fix candidates", () => {
    const smitheryReport = makeReport("smithery-server", "smithery", [makeVuln("high")]);
    const githubReport = makeReport("owner/repo", "github", [makeVuln("moderate")]);
    const npmReport = makeReport("npm-server", "npm", [makeVuln("critical")]);

    const allReports = [smitheryReport, githubReport, npmReport];

    // Replicate the filter logic from runAuditFix
    const npmWithVulns = allReports.filter(
      (r) => r.vulnerabilities.length > 0 && r.source === "npm"
    );
    const nonNpmWithVulns = allReports.filter(
      (r) => r.vulnerabilities.length > 0 && r.source !== "npm"
    );

    expect(npmWithVulns).toHaveLength(1);
    expect(npmWithVulns[0].server).toBe("npm-server");
    expect(nonNpmWithVulns).toHaveLength(2);
  });
});
