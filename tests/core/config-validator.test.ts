/**
 * config-validator.test.ts
 * Unit tests for lockfile and client config schema validation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock paths before importing module
vi.mock("../../src/utils/paths.js", () => ({
  resolveConfigPath: vi.fn((client: string) => `/fake/${client}/config.json`),
  getMcpmanDir: vi.fn(() => "/fake/.mcpman"),
}));

import { resolveConfigPath } from "../../src/utils/paths.js";
import {
  validateClientConfig,
  validateLockfile,
} from "../../src/core/config-validator.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-validator-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── validateLockfile ──────────────────────────────────────────────────────────

describe("validateLockfile", () => {
  let dir: string;
  let lockfile: string;

  beforeEach(() => {
    dir = makeTmpDir();
    lockfile = path.join(dir, "mcpman.lock");
  });
  afterEach(() => cleanup(dir));

  it("returns error when file does not exist", () => {
    const r = validateLockfile(path.join(dir, "missing.lock"));
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Lockfile not found");
  });

  it("returns error for invalid JSON", () => {
    fs.writeFileSync(lockfile, "not json");
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Invalid JSON");
  });

  it("returns error if lockfileVersion is not 1", () => {
    fs.writeFileSync(lockfile, JSON.stringify({ lockfileVersion: 2, servers: {} }));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("lockfileVersion"))).toBe(true);
  });

  it("passes for valid empty lockfile", () => {
    fs.writeFileSync(lockfile, JSON.stringify({ lockfileVersion: 1, servers: {} }));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("passes for valid lockfile with servers", () => {
    const data = {
      lockfileVersion: 1,
      servers: {
        "my-server": {
          version: "1.0.0",
          source: "npm",
          command: "node",
          args: ["-e", "server.js"],
          resolved: "",
          integrity: "",
          runtime: "node",
          envVars: [],
          installedAt: new Date().toISOString(),
          clients: [],
        },
      },
    };
    fs.writeFileSync(lockfile, JSON.stringify(data));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(true);
  });

  it("reports missing required fields in server entry", () => {
    const data = {
      lockfileVersion: 1,
      servers: {
        "bad-server": { version: "1.0.0" }, // missing source, command, args
      },
    };
    fs.writeFileSync(lockfile, JSON.stringify(data));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("source"))).toBe(true);
    expect(r.errors.some((e) => e.includes("command"))).toBe(true);
    expect(r.errors.some((e) => e.includes("args"))).toBe(true);
  });

  it("reports invalid source value", () => {
    const data = {
      lockfileVersion: 1,
      servers: {
        srv: { version: "1.0.0", source: "invalid", command: "node", args: [] },
      },
    };
    fs.writeFileSync(lockfile, JSON.stringify(data));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("invalid source"))).toBe(true);
  });

  it("reports args not array", () => {
    const data = {
      lockfileVersion: 1,
      servers: {
        srv: { version: "1.0.0", source: "npm", command: "node", args: "bad" },
      },
    };
    fs.writeFileSync(lockfile, JSON.stringify(data));
    const r = validateLockfile(lockfile);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("args must be an array"))).toBe(true);
  });

  it("returns file path in result", () => {
    fs.writeFileSync(lockfile, JSON.stringify({ lockfileVersion: 1, servers: {} }));
    const r = validateLockfile(lockfile);
    expect(r.file).toBe(lockfile);
  });
});

// ── validateClientConfig ──────────────────────────────────────────────────────

describe("validateClientConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
    vi.mocked(resolveConfigPath).mockImplementation(
      (client: string) => path.join(dir, `${client}.json`),
    );
  });
  afterEach(() => cleanup(dir));

  it("returns error when config file not found", () => {
    const r = validateClientConfig("claude-desktop");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Config file not found");
  });

  it("returns error for invalid JSON", () => {
    const file = vi.mocked(resolveConfigPath)("claude-desktop");
    fs.writeFileSync(file, "not json");
    const r = validateClientConfig("claude-desktop");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Invalid JSON");
  });

  it("passes for config with no mcpServers key", () => {
    const file = vi.mocked(resolveConfigPath)("claude-desktop");
    fs.writeFileSync(file, JSON.stringify({ otherKey: true }));
    const r = validateClientConfig("claude-desktop");
    expect(r.valid).toBe(true);
  });

  it("passes for valid mcpServers entries", () => {
    const file = vi.mocked(resolveConfigPath)("cursor");
    fs.writeFileSync(
      file,
      JSON.stringify({
        mcpServers: {
          "my-srv": { command: "node", args: ["server.js"] },
        },
      }),
    );
    const r = validateClientConfig("cursor");
    expect(r.valid).toBe(true);
  });

  it("reports missing command in mcpServers entry", () => {
    const file = vi.mocked(resolveConfigPath)("vscode");
    fs.writeFileSync(
      file,
      JSON.stringify({
        mcpServers: {
          "bad-srv": { args: [] }, // missing command
        },
      }),
    );
    const r = validateClientConfig("vscode");
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("command"))).toBe(true);
  });
});
