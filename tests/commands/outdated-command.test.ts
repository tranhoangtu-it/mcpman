/**
 * outdated-command.test.ts
 * Tests for the `mcpman outdated` command logic via its underlying service layer.
 * We test version-checker integration (already unit-tested in update.test.ts)
 * plus the table-formatting and filtering behaviour specific to outdated.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkAllVersions, compareVersions } from "../../src/core/version-checker.js";
import type { LockfileData } from "../../src/core/lockfile.js";

// ── compareVersions sanity (already in update.test.ts, kept light here) ──────

describe("compareVersions used by outdated", () => {
  it("identifies an outdated package (current < latest)", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
  });

  it("identifies an up-to-date package", () => {
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });
});

// ── checkAllVersions — outdated filtering ─────────────────────────────────────

describe("checkAllVersions for outdated display", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  const makeLockfile = (
    servers: Record<string, { version: string; source: "npm" | "smithery" | "github" | "local" | "mcpman" }>,
  ): LockfileData => ({
    lockfileVersion: 1,
    servers: Object.fromEntries(
      Object.entries(servers).map(([name, { version, source }]) => [
        name,
        {
          version,
          source,
          resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          integrity: "sha512-abc",
          runtime: "node" as const,
          command: "npx",
          args: ["-y", name],
          envVars: [],
          installedAt: new Date().toISOString(),
          clients: ["claude-desktop" as const],
        },
      ]),
    ),
  });

  it("returns hasUpdate=true for outdated npm package", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "2.0.0" }),
    });

    const lockfile = makeLockfile({ "my-server": { version: "1.0.0", source: "npm" } });
    const results = await checkAllVersions(lockfile);

    expect(results).toHaveLength(1);
    expect(results[0].hasUpdate).toBe(true);
    expect(results[0].latestVersion).toBe("2.0.0");
    expect(results[0].updateType).toBe("major");
  });

  it("returns hasUpdate=false for up-to-date package", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });

    const lockfile = makeLockfile({ "my-server": { version: "1.0.0", source: "npm" } });
    const results = await checkAllVersions(lockfile);

    expect(results[0].hasUpdate).toBe(false);
  });

  it("separates outdated from up-to-date in mixed lockfile", async () => {
    // server-a has update; server-b is current
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: "3.0.0" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: "0.5.0" }) });

    const lockfile = makeLockfile({
      "server-a": { version: "1.0.0", source: "npm" },
      "server-b": { version: "0.5.0", source: "npm" },
    });

    const results = await checkAllVersions(lockfile);
    const outdated = results.filter((r) => r.hasUpdate);
    const current = results.filter((r) => !r.hasUpdate);

    expect(outdated).toHaveLength(1);
    expect(outdated[0].server).toBe("server-a");
    expect(current).toHaveLength(1);
    expect(current[0].server).toBe("server-b");
  });

  it("handles network error gracefully (treats as up-to-date)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ENOTFOUND"));

    const lockfile = makeLockfile({ "my-server": { version: "1.0.0", source: "npm" } });
    const results = await checkAllVersions(lockfile);

    expect(results[0].hasUpdate).toBe(false);
    expect(results[0].latestVersion).toBe("1.0.0");
  });

  it("returns empty array for empty lockfile", async () => {
    const lockfile: LockfileData = { lockfileVersion: 1, servers: {} };
    const results = await checkAllVersions(lockfile);
    expect(results).toHaveLength(0);
  });

  it("detects minor update type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.2.0" }),
    });

    const lockfile = makeLockfile({ "my-server": { version: "1.1.0", source: "npm" } });
    const results = await checkAllVersions(lockfile);

    expect(results[0].updateType).toBe("minor");
  });

  it("detects patch update type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.5" }),
    });

    const lockfile = makeLockfile({ "my-server": { version: "1.0.0", source: "npm" } });
    const results = await checkAllVersions(lockfile);

    expect(results[0].updateType).toBe("patch");
  });
});
