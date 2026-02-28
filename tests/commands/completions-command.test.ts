/**
 * completions-command.test.ts
 * Tests for completion-generator: command list, server names, and shell scripts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateBashCompletion,
  generateFishCompletion,
  generateZshCompletion,
  getCommandList,
  getServerNames,
} from "../../src/core/completion-generator.js";

// ── Mock lockfile ──────────────────────────────────────────────────────────────

vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: vi.fn().mockReturnValue({
    lockfileVersion: 1,
    servers: {
      "server-a": { version: "1.0.0", source: "npm" },
      "server-b": { version: "2.0.0", source: "local" },
    },
  }),
  resolveLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
  findLockfile: vi.fn().mockReturnValue(null),
  getGlobalLockfilePath: vi.fn().mockReturnValue("/tmp/mcpman.lock"),
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-completions-test-"));
  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
    stdout: process.stdout,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ── getCommandList ─────────────────────────────────────────────────────────────

describe("getCommandList", () => {
  it("returns all 26 subcommands", () => {
    const cmds = getCommandList();
    expect(cmds.length).toBe(26);
  });

  it("includes all v0.7 new commands", () => {
    const cmds = getCommandList();
    expect(cmds).toContain("create");
    expect(cmds).toContain("link");
    expect(cmds).toContain("watch");
    expect(cmds).toContain("registry");
    expect(cmds).toContain("completions");
    expect(cmds).toContain("why");
  });

  it("includes all v0.6 existing commands", () => {
    const cmds = getCommandList();
    expect(cmds).toContain("install");
    expect(cmds).toContain("list");
    expect(cmds).toContain("remove");
    expect(cmds).toContain("run");
    expect(cmds).toContain("profiles");
    expect(cmds).toContain("plugin");
  });
});

// ── getServerNames ─────────────────────────────────────────────────────────────

describe("getServerNames", () => {
  it("returns server names from lockfile", () => {
    const names = getServerNames();
    expect(names).toContain("server-a");
    expect(names).toContain("server-b");
  });
});

// ── generateBashCompletion ─────────────────────────────────────────────────────

describe("generateBashCompletion", () => {
  it("contains complete -F directive", () => {
    const script = generateBashCompletion();
    expect(script).toContain("complete -F _mcpman_completions mcpman");
  });

  it("calls --list-commands for dynamic completion", () => {
    const script = generateBashCompletion();
    expect(script).toContain("--list-commands");
  });

  it("calls --list-servers for server arg commands", () => {
    const script = generateBashCompletion();
    expect(script).toContain("--list-servers");
  });

  it("includes client type completions", () => {
    const script = generateBashCompletion();
    expect(script).toContain("claude-desktop");
    expect(script).toContain("cursor");
  });
});

// ── generateZshCompletion ──────────────────────────────────────────────────────

describe("generateZshCompletion", () => {
  it("contains compdef directive", () => {
    const script = generateZshCompletion();
    expect(script).toContain("compdef _mcpman mcpman");
  });

  it("calls --list-commands", () => {
    const script = generateZshCompletion();
    expect(script).toContain("--list-commands");
  });

  it("calls --list-servers", () => {
    const script = generateZshCompletion();
    expect(script).toContain("--list-servers");
  });
});

// ── generateFishCompletion ─────────────────────────────────────────────────────

describe("generateFishCompletion", () => {
  it("contains complete -c mcpman directive", () => {
    const script = generateFishCompletion();
    expect(script).toContain("complete -c mcpman");
  });

  it("calls --list-commands", () => {
    const script = generateFishCompletion();
    expect(script).toContain("--list-commands");
  });

  it("calls --list-servers", () => {
    const script = generateFishCompletion();
    expect(script).toContain("--list-servers");
  });

  it("disables default file completion", () => {
    const script = generateFishCompletion();
    expect(script).toContain("-f");
  });
});
