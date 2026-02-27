/**
 * profiles-command.test.ts
 * Tests for `mcpman profiles` sub-commands: create, switch, list, delete.
 * Mocks profile-service and lockfile functions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../src/core/profile-service.js";
import type { LockfileData } from "../../src/core/lockfile.js";

// ── Mock profile-service ───────────────────────────────────────────────────────

vi.mock("../../src/core/profile-service.js", () => ({
  createProfile: vi.fn(),
  listProfiles: vi.fn(),
  loadProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

// ── Mock lockfile ──────────────────────────────────────────────────────────────

vi.mock("../../src/core/lockfile.js", () => ({
  writeLockfile: vi.fn(),
  readLockfile: vi.fn().mockReturnValue({ lockfileVersion: 1, servers: {} }),
  resolveLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
  findLockfile: vi.fn().mockReturnValue(null),
  getGlobalLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
}));

import {
  createProfile,
  listProfiles,
  loadProfile,
  deleteProfile,
} from "../../src/core/profile-service.js";
import { writeLockfile } from "../../src/core/lockfile.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProfile(name: string, serverCount = 1): Profile {
  const servers: Record<string, LockfileData["servers"][string]> = {};
  for (let i = 0; i < serverCount; i++) {
    servers[`server-${i}`] = {
      version: "1.0.0",
      source: "npm",
      resolved: "",
      integrity: "",
      runtime: "node",
      command: "npx",
      args: [],
      envVars: [],
      installedAt: "2024-01-01T00:00:00.000Z",
      clients: ["claude-desktop"],
    };
  }
  return {
    name,
    description: `${name} description`,
    createdAt: new Date().toISOString(),
    servers,
  };
}

async function runProfiles(
  action: string,
  name?: string,
  description?: string,
): Promise<void> {
  const mod = await import("../../src/commands/profiles.js");
  const cmd = mod.default as unknown as {
    run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
  };
  await cmd.run({ args: { action, name, description } });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
  });
});

// ── create ─────────────────────────────────────────────────────────────────────

describe("profiles command — create", () => {
  it("calls createProfile and prints success", async () => {
    (createProfile as ReturnType<typeof vi.fn>).mockReturnValue(makeProfile("dev", 2));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runProfiles("create", "dev", "Dev environment");

    expect(createProfile).toHaveBeenCalledWith("dev", "Dev environment");
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/dev/);
    expect(output).toMatch(/2 server/i);

    logSpy.mockRestore();
  });

  it("exits with code 1 when name is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("create")).rejects.toThrow("process.exit(1)");

    errorSpy.mockRestore();
  });

  it("exits with code 1 when createProfile throws (duplicate)", async () => {
    (createProfile as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Profile 'dev' already exists.");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("create", "dev")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/already exists/i);

    errorSpy.mockRestore();
  });
});

// ── list ───────────────────────────────────────────────────────────────────────

describe("profiles command — list", () => {
  it("prints message when no profiles exist", async () => {
    (listProfiles as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runProfiles("list");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/no profiles/i);

    logSpy.mockRestore();
  });

  it("prints each profile with server count", async () => {
    (listProfiles as ReturnType<typeof vi.fn>).mockReturnValue([
      makeProfile("dev", 3),
      makeProfile("prod", 5),
    ]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runProfiles("list");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/dev/);
    expect(output).toMatch(/prod/);

    logSpy.mockRestore();
  });
});

// ── switch ─────────────────────────────────────────────────────────────────────

describe("profiles command — switch", () => {
  it("writes lockfile with profile servers and prints success", async () => {
    const profile = makeProfile("staging", 2);
    (loadProfile as ReturnType<typeof vi.fn>).mockReturnValue(profile);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runProfiles("switch", "staging");

    expect(writeLockfile).toHaveBeenCalledWith(
      expect.objectContaining({ servers: profile.servers }),
    );
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/staging/);

    logSpy.mockRestore();
  });

  it("exits with code 1 when name is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("switch")).rejects.toThrow("process.exit(1)");

    errorSpy.mockRestore();
  });

  it("exits with code 1 when profile not found", async () => {
    (loadProfile as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("switch", "ghost")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/ghost/);

    errorSpy.mockRestore();
  });
});

// ── delete ─────────────────────────────────────────────────────────────────────

describe("profiles command — delete", () => {
  it("calls deleteProfile and prints success when found", async () => {
    (deleteProfile as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runProfiles("delete", "old-profile");

    expect(deleteProfile).toHaveBeenCalledWith("old-profile");
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/deleted/i);

    logSpy.mockRestore();
  });

  it("exits with code 1 when name is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("delete")).rejects.toThrow("process.exit(1)");

    errorSpy.mockRestore();
  });

  it("exits with code 1 when profile not found", async () => {
    (deleteProfile as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("delete", "no-such")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/no-such/);

    errorSpy.mockRestore();
  });
});

// ── unknown action ─────────────────────────────────────────────────────────────

describe("profiles command — unknown action", () => {
  it("exits with code 1 for unknown action", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runProfiles("frobnicate")).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/unknown action/i);

    errorSpy.mockRestore();
  });
});
