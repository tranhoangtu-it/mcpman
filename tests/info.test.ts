import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageMetadata } from "../src/core/security-scanner.js";
import type { LockfileData } from "../src/core/lockfile.js";

// ─── Shared mock setup ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock lockfile module so tests control what "installed" means
vi.mock("../src/core/lockfile.js", () => ({
  readLockfile: vi.fn(),
  resolveLockfilePath: vi.fn().mockReturnValue("/tmp/test-mcpman.lock"),
  findLockfile: vi.fn().mockReturnValue(null),
  getGlobalLockfilePath: vi.fn().mockReturnValue("/tmp/test-mcpman.lock"),
}));

import { readLockfile } from "../src/core/lockfile.js";

// Helper: build minimal LockfileData
function makeLockfile(servers: LockfileData["servers"] = {}): LockfileData {
  return { lockfileVersion: 1, servers };
}

// Helper: build a minimal lock entry
function makeLockEntry(overrides: Partial<LockfileData["servers"][string]> = {}): LockfileData["servers"][string] {
  return {
    version: "1.2.0",
    source: "npm",
    resolved: "https://registry.npmjs.org/test-mcp/-/test-mcp-1.2.0.tgz",
    integrity: "sha512-xxx",
    runtime: "node",
    command: "npx",
    args: ["-y", "test-mcp@1.2.0"],
    envVars: ["API_KEY", "API_SECRET"],
    installedAt: new Date().toISOString(),
    clients: ["claude-desktop", "cursor"],
    ...overrides,
  };
}

// Helper: build npm registry response body
function makeNpmRegResponse(name: string): Record<string, unknown> {
  const created = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const modified = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return {
    name,
    "dist-tags": { latest: "1.2.0" },
    versions: { "1.2.0": {} },
    time: { created, modified },
    maintainers: [{ name: "alice" }, { name: "bob" }],
  };
}

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// ─── getPackageInfo() ────────────────────────────────────────────────────────

describe("getPackageInfo() — installed server (lockfile + registry)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.mocked(readLockfile).mockReturnValue(makeLockfile({ "test-mcp": makeLockEntry() }));
  });

  it("returns PackageInfo with isInstalled=true for a server in lockfile", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(makeNpmRegResponse("test-mcp")))
      .mockResolvedValueOnce(makeResponse({ downloads: 8000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("test-mcp");

    expect(info).not.toBeNull();
    expect(info!.isInstalled).toBe(true);
    expect(info!.name).toBe("test-mcp");
    expect(info!.version).toBe("1.2.0");
    expect(info!.source).toBe("npm");
    expect(info!.runtime).toBe("node");
    expect(info!.envVars).toEqual(["API_KEY", "API_SECRET"]);
    expect(info!.installedClients).toContain("claude-desktop");
    expect(info!.installedClients).toContain("cursor");
  });

  it("populates registry metadata when npm responds", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(makeNpmRegResponse("test-mcp")))
      .mockResolvedValueOnce(makeResponse({ downloads: 8000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("test-mcp");

    expect(info!.weeklyDownloads).toBe(8000);
    expect(info!.maintainerCount).toBe(2);
    expect(info!.packageAge).toBeGreaterThan(390);
    expect(info!.deprecated).toBe(false);
  });

  it("computes trustScore as a number 0-100", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(makeNpmRegResponse("test-mcp")))
      .mockResolvedValueOnce(makeResponse({ downloads: 8000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("test-mcp");

    expect(info!.trustScore).not.toBeNull();
    expect(info!.trustScore).toBeGreaterThanOrEqual(0);
    expect(info!.trustScore).toBeLessThanOrEqual(100);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(info!.riskLevel);
  });
});

describe("getPackageInfo() — not installed (registry only)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    // Server not in lockfile
    vi.mocked(readLockfile).mockReturnValue(makeLockfile({}));
  });

  it("returns PackageInfo with isInstalled=false when not in lockfile", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(makeNpmRegResponse("some-mcp")))
      .mockResolvedValueOnce(makeResponse({ downloads: 3000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("some-mcp");

    expect(info).not.toBeNull();
    expect(info!.isInstalled).toBe(false);
    expect(info!.name).toBe("some-mcp");
    expect(info!.version).toBe("unknown");
    expect(info!.installedClients).toHaveLength(0);
    expect(info!.envVars).toHaveLength(0);
  });

  it("still returns registry metadata for non-installed package", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(makeNpmRegResponse("some-mcp")))
      .mockResolvedValueOnce(makeResponse({ downloads: 3000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("some-mcp");

    expect(info!.weeklyDownloads).toBe(3000);
    expect(info!.maintainerCount).toBe(2);
    expect(info!.trustScore).toBeGreaterThanOrEqual(0);
  });
});

describe("getPackageInfo() — unknown server (404 from npm)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.mocked(readLockfile).mockReturnValue(makeLockfile({}));
  });

  it("returns null when server is not in lockfile and npm returns 404", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 404))
      .mockResolvedValueOnce(makeResponse({ downloads: 0 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("nonexistent-pkg");

    expect(info).toBeNull();
  });
});

describe("getPackageInfo() — deprecated package", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.mocked(readLockfile).mockReturnValue(makeLockfile({ "depr-mcp": makeLockEntry({ version: "0.9.0" }) }));
  });

  it("marks deprecated=true for packages with deprecated field in registry", async () => {
    const created = new Date(Date.now() - 300 * 86_400_000).toISOString();
    const modified = new Date().toISOString();
    mockFetch
      .mockResolvedValueOnce(makeResponse({
        name: "depr-mcp",
        "dist-tags": { latest: "0.9.0" },
        versions: { "0.9.0": { deprecated: "Use new-mcp instead" } },
        time: { created, modified },
        maintainers: [{ name: "alice" }],
      }))
      .mockResolvedValueOnce(makeResponse({ downloads: 500 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("depr-mcp");

    expect(info).not.toBeNull();
    expect(info!.deprecated).toBe(true);
    expect(info!.isInstalled).toBe(true);
  });
});

describe("getPackageInfo() — trust score integration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.mocked(readLockfile).mockReturnValue(makeLockfile({}));
  });

  it("high-quality package gets LOW risk level", async () => {
    const created = new Date(Date.now() - 800 * 86_400_000).toISOString();
    const modified = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockFetch
      .mockResolvedValueOnce(makeResponse({
        name: "popular-mcp",
        "dist-tags": { latest: "3.0.0" },
        versions: { "3.0.0": {} },
        time: { created, modified },
        maintainers: [{ name: "a" }, { name: "b" }, { name: "c" }],
      }))
      .mockResolvedValueOnce(makeResponse({ downloads: 500_000 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("popular-mcp");

    expect(info!.trustScore).toBeGreaterThanOrEqual(80);
    expect(info!.riskLevel).toBe("LOW");
  });

  it("riskLevel is UNKNOWN when npm metadata unavailable and not installed", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({}, 404))
      .mockResolvedValueOnce(makeResponse({ downloads: 0 }));

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("ghost-pkg");

    // null returned because not installed + 404
    expect(info).toBeNull();
  });

  it("installed smithery server gets UNKNOWN riskLevel (no npm metadata)", async () => {
    vi.mocked(readLockfile).mockReturnValue(
      makeLockfile({
        "my-smithery": makeLockEntry({ source: "smithery", runtime: "node" }),
      })
    );

    const { getPackageInfo } = await import("../src/core/package-info.js");
    const info = await getPackageInfo("my-smithery");

    // non-npm sources skip npm fetch, riskLevel stays UNKNOWN
    expect(info).not.toBeNull();
    expect(info!.riskLevel).toBe("UNKNOWN");
    expect(info!.trustScore).toBeNull();
    expect(info!.isInstalled).toBe(true);
  });
});
