/**
 * upgrade-command.test.ts
 * Tests for `mcpman upgrade` — self-update via npm.
 * Mocks execSync to avoid real npm calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock child_process ─────────────────────────────────────────────────────────

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// ── Mock constants to control APP_VERSION ─────────────────────────────────────

vi.mock("../../src/utils/constants.js", () => ({
  APP_VERSION: "0.5.0",
  APP_NAME: "mcpman",
}));

import { execSync } from "node:child_process";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function runUpgrade(checkOnly = false): Promise<void> {
  const mod = await import("../../src/commands/upgrade.js");
  const cmd = mod.default as unknown as {
    run: (ctx: { args: Record<string, unknown> }) => Promise<void>;
  };
  await cmd.run({ args: { check: checkOnly } });
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

// ── Already latest ─────────────────────────────────────────────────────────────

describe("upgrade command — already latest", () => {
  it("prints green message and returns without installing when already latest", async () => {
    // npm view returns same version as APP_VERSION (0.5.0)
    (execSync as ReturnType<typeof vi.fn>).mockReturnValueOnce("0.5.0\n");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runUpgrade();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/already on the latest/i);

    // Should NOT call npm install
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npm view mcpman version"),
      expect.any(Object),
    );

    logSpy.mockRestore();
  });
});

// ── Update available ───────────────────────────────────────────────────────────

describe("upgrade command — update available", () => {
  it("shows version diff and installs when update is available", async () => {
    (execSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce("0.6.0\n")  // npm view
      .mockReturnValueOnce(undefined);  // npm install

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runUpgrade();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/update available/i);
    expect(output).toMatch(/0\.5\.0/);
    expect(output).toMatch(/0\.6\.0/);

    // Should call npm install
    expect(execSync).toHaveBeenCalledTimes(2);
    expect(execSync).toHaveBeenLastCalledWith(
      expect.stringContaining("npm install -g mcpman@0.6.0"),
      expect.any(Object),
    );

    logSpy.mockRestore();
  });

  it("prints success message after successful install", async () => {
    (execSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce("0.6.0\n")
      .mockReturnValueOnce(undefined);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runUpgrade();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/upgraded/i);

    logSpy.mockRestore();
  });
});

// ── --check flag ───────────────────────────────────────────────────────────────

describe("upgrade command — --check flag", () => {
  it("shows update available but skips install when --check is set", async () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValueOnce("0.6.0\n");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runUpgrade(true);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/update available/i);

    // Only one execSync call (npm view), no install
    expect(execSync).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it("prints hint to run upgrade without --check", async () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValueOnce("0.9.0\n");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runUpgrade(true);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/mcpman upgrade/i);

    logSpy.mockRestore();
  });
});

// ── npm errors ─────────────────────────────────────────────────────────────────

describe("upgrade command — npm errors", () => {
  it("exits with code 1 when npm view fails", async () => {
    (execSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("ENOENT: npm not found");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runUpgrade()).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/could not check/i);

    errorSpy.mockRestore();
  });

  it("exits with code 1 when npm install fails", async () => {
    (execSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce("0.6.0\n")
      .mockImplementationOnce(() => {
        throw new Error("npm install failed");
      });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runUpgrade()).rejects.toThrow("process.exit(1)");

    const output = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toMatch(/upgrade failed/i);

    errorSpy.mockRestore();
  });
});
