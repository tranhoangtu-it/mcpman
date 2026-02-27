/**
 * secrets-command.test.ts
 * Tests for the secrets CLI command argument parsing and flow.
 * Mocks VaultService to isolate command logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock vault-service before import ──────────────────────────────────────────

vi.mock("../../src/core/vault-service.js", () => ({
  setSecret: vi.fn(),
  getSecret: vi.fn(),
  getSecretsForServer: vi.fn(),
  removeSecret: vi.fn(),
  listSecrets: vi.fn(),
  getMasterPassword: vi.fn().mockResolvedValue("masterPass1234"),
  clearPasswordCache: vi.fn(),
  getVaultPath: vi.fn().mockReturnValue("/tmp/test-vault.enc"),
}));

// Mock @clack/prompts to avoid interactive prompts in tests
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  confirm: vi.fn().mockResolvedValue(true),
  password: vi.fn().mockResolvedValue("masterPass1234"),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
}));

// Mock node:fs existsSync for vault path check in set command
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

import {
  setSecret,
  removeSecret,
  listSecrets,
  getMasterPassword,
} from "../../src/core/vault-service.js";
import * as p from "@clack/prompts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run command's run() handler directly by importing the command module. */
async function runSetCommand(server: string, keyvalue: string) {
  // Dynamically import to get fresh module state after mocks are set up
  const mod = await import("../../src/commands/secrets.js");
  const cmd = mod.default;
  // Access the set subcommand's run function via citty internals
  const setCmd = (cmd as unknown as { subCommands: { set: { run: (ctx: { args: Record<string, string> }) => Promise<void> } } }).subCommands.set;
  await setCmd.run({ args: { server, keyvalue } });
}

async function runListCommand(server?: string) {
  const mod = await import("../../src/commands/secrets.js");
  const cmd = mod.default;
  const listCmd = (cmd as unknown as { subCommands: { list: { run: (ctx: { args: Record<string, string | undefined> }) => Promise<void> } } }).subCommands.list;
  await listCmd.run({ args: { server } });
}

async function runRemoveCommand(server: string, key: string) {
  const mod = await import("../../src/commands/secrets.js");
  const cmd = mod.default;
  const removeCmd = (cmd as unknown as { subCommands: { remove: { run: (ctx: { args: Record<string, string> }) => Promise<void> } } }).subCommands.remove;
  await removeCmd.run({ args: { server, key } });
}

// ── Tests: set ────────────────────────────────────────────────────────────────

describe("secrets set", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (p.spinner as ReturnType<typeof vi.fn>).mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  });

  it("calls setSecret with parsed key and value", async () => {
    await runSetCommand("my-server", "API_KEY=secret123");
    expect(setSecret).toHaveBeenCalledWith(
      "my-server",
      "API_KEY",
      "secret123",
      "masterPass1234"
    );
  });

  it("calls setSecret with value containing = sign", async () => {
    await runSetCommand("server", "TOKEN=abc=def=ghi");
    expect(setSecret).toHaveBeenCalledWith(
      "server",
      "TOKEN",
      "abc=def=ghi",
      "masterPass1234"
    );
  });

  it("exits on invalid KEY=VALUE format", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error("process.exit called");
    });
    await expect(runSetCommand("server", "INVALID_NO_EQUALS")).rejects.toThrow("process.exit called");
    expect(setSecret).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("prompts for master password", async () => {
    await runSetCommand("server", "KEY=VALUE");
    expect(getMasterPassword).toHaveBeenCalled();
  });
});

// ── Tests: list ───────────────────────────────────────────────────────────────

describe("secrets list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("calls listSecrets with no filter when no server given", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
    await runListCommand(undefined);
    expect(listSecrets).toHaveBeenCalledWith(undefined);
  });

  it("calls listSecrets with server filter", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "my-srv", keys: ["TOKEN"] },
    ]);
    await runListCommand("my-srv");
    expect(listSecrets).toHaveBeenCalledWith("my-srv");
  });

  it("prints 'No secrets' message when vault is empty", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runListCommand(undefined);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes("No secrets"))).toBe(true);
    logSpy.mockRestore();
  });

  it("prints server and key names for non-empty vault", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "github-server", keys: ["GITHUB_TOKEN", "WEBHOOK_SECRET"] },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runListCommand(undefined);
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("github-server");
    expect(output).toContain("GITHUB_TOKEN");
    expect(output).toContain("WEBHOOK_SECRET");
    logSpy.mockRestore();
  });
});

// ── Tests: remove ─────────────────────────────────────────────────────────────

describe("secrets remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("calls removeSecret after confirmation", async () => {
    await runRemoveCommand("my-server", "API_KEY");
    expect(removeSecret).toHaveBeenCalledWith("my-server", "API_KEY");
  });

  it("does not remove if user declines confirmation", async () => {
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await runRemoveCommand("my-server", "API_KEY");
    expect(removeSecret).not.toHaveBeenCalled();
  });

  it("does not remove if user cancels prompt", async () => {
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(true);
    await runRemoveCommand("my-server", "API_KEY");
    expect(removeSecret).not.toHaveBeenCalled();
  });

  it("handles removeSecret error gracefully", async () => {
    (removeSecret as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("vault write failed");
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error("process.exit called");
    });
    await expect(runRemoveCommand("srv", "KEY")).rejects.toThrow("process.exit called");
    exitSpy.mockRestore();
  });
});
