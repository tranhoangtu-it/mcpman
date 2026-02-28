/**
 * why-command.test.ts
 * Tests for why-service: provenance lookup, profile scanning, orphan detection.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatWhyOutput, getServerProvenance, scanProfiles } from "../../src/core/why-service.js";

// ── Mock client-detector ───────────────────────────────────────────────────────

vi.mock("../../src/clients/client-detector.js", () => ({
  getInstalledClients: vi.fn().mockResolvedValue([
    {
      type: "claude-desktop",
      readConfig: vi.fn().mockResolvedValue({ servers: {} }),
    },
    {
      type: "cursor",
      readConfig: vi.fn().mockResolvedValue({ servers: {} }),
    },
  ]),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

let tmpDir: string;
let lockfilePath: string;
let profilesDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-why-test-"));
  lockfilePath = path.join(tmpDir, "mcpman.lock");
  profilesDir = path.join(tmpDir, "profiles");
  fs.mkdirSync(profilesDir, { recursive: true });
});

afterEach(() => {
  vi.clearAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function writeLock(servers: Record<string, unknown>) {
  fs.writeFileSync(lockfilePath, JSON.stringify({ lockfileVersion: 1, servers }, null, 2));
}

function writeProfile(name: string, servers: Record<string, unknown>) {
  const profile = { name, description: "", createdAt: new Date().toISOString(), servers };
  fs.writeFileSync(path.join(profilesDir, `${name}.json`), JSON.stringify(profile, null, 2));
}

const baseEntry = {
  version: "1.2.3",
  source: "npm",
  resolved: "https://registry.npmjs.org/my-server/-/my-server-1.2.3.tgz",
  integrity: "sha512-abc123",
  runtime: "node",
  command: "npx",
  args: ["-y", "my-server"],
  envVars: ["API_KEY", "BASE_URL"],
  installedAt: "2026-02-28T10:30:00Z",
  clients: ["claude-desktop", "cursor"],
};

// ── getServerProvenance — found ────────────────────────────────────────────────

describe("getServerProvenance — found in lockfile", () => {
  it("returns full provenance for known server", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-server");
    expect(result!.version).toBe("1.2.3");
    expect(result!.source).toBe("npm");
    expect(result!.orphaned).toBe(false);
  });

  it("includes all four client types in status list", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);

    expect(result!.clients).toHaveLength(4);
    const types = result!.clients.map((c) => c.type);
    expect(types).toContain("claude-desktop");
    expect(types).toContain("cursor");
    expect(types).toContain("vscode");
    expect(types).toContain("windsurf");
  });

  it("marks lockfile clients as registered", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);

    const cd = result!.clients.find((c) => c.type === "claude-desktop");
    expect(cd?.registered).toBe(true);
    const vscode = result!.clients.find((c) => c.type === "vscode");
    expect(vscode?.registered).toBe(false);
  });

  it("returns envVars from lockfile entry", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    expect(result!.envVars).toContain("API_KEY");
    expect(result!.envVars).toContain("BASE_URL");
  });
});

// ── getServerProvenance — not found ───────────────────────────────────────────

describe("getServerProvenance — not found", () => {
  it("returns null for completely unknown server", async () => {
    writeLock({});
    const result = await getServerProvenance("ghost-server", lockfilePath, profilesDir);
    expect(result).toBeNull();
  });
});

// ── scanProfiles ───────────────────────────────────────────────────────────────

describe("scanProfiles", () => {
  it("returns profile names that include the server", () => {
    writeProfile("dev", { "my-server": baseEntry });
    writeProfile("prod", { "my-server": baseEntry, "other-server": baseEntry });
    writeProfile("staging", { "other-server": baseEntry });

    const profiles = scanProfiles("my-server", profilesDir);
    expect(profiles).toContain("dev");
    expect(profiles).toContain("prod");
    expect(profiles).not.toContain("staging");
  });

  it("returns empty array when profiles dir is missing", () => {
    const missing = path.join(tmpDir, "nonexistent-profiles");
    expect(scanProfiles("any-server", missing)).toEqual([]);
  });

  it("skips corrupt profile files gracefully", () => {
    fs.writeFileSync(path.join(profilesDir, "corrupt.json"), "{ invalid json");
    expect(() => scanProfiles("my-server", profilesDir)).not.toThrow();
  });
});

// ── getServerProvenance — profiles cross-reference ────────────────────────────

describe("getServerProvenance — profiles", () => {
  it("lists profiles that include the server", async () => {
    writeLock({ "my-server": baseEntry });
    writeProfile("dev", { "my-server": baseEntry });
    writeProfile("prod", { "my-server": baseEntry });

    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    expect(result!.profiles).toContain("dev");
    expect(result!.profiles).toContain("prod");
  });

  it("returns empty profiles list when no profiles reference server", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    expect(result!.profiles).toEqual([]);
  });
});

// ── formatWhyOutput ────────────────────────────────────────────────────────────

describe("formatWhyOutput", () => {
  it("includes server name and version", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    const output = formatWhyOutput(result!);
    expect(output).toContain("my-server");
    expect(output).toContain("1.2.3");
    expect(output).toContain("npm");
  });

  it("includes env var names", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    const output = formatWhyOutput(result!);
    expect(output).toContain("API_KEY");
    expect(output).toContain("BASE_URL");
  });

  it("shows client registration status", async () => {
    writeLock({ "my-server": baseEntry });
    const result = await getServerProvenance("my-server", lockfilePath, profilesDir);
    const output = formatWhyOutput(result!);
    expect(output).toContain("registered");
  });
});
