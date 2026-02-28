/**
 * link-command.test.ts
 * Tests for `mcpman link` command and link-service.
 * Uses temp directories for file I/O; mocks client registration.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLocalServer, registerLinkedServer } from "../../src/core/link-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-link-test-"));
  vi.stubGlobal("process", {
    ...process,
    exit: vi.fn((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }),
    on: process.on.bind(process),
    env: process.env,
    cwd: () => tmpDir,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

function makeNodeProject(dir: string, opts: { useBin?: boolean; useMain?: boolean } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.ts"), "// server");

  const pkg: Record<string, unknown> = {
    name: "test-server",
    version: "1.2.3",
    mcp: { name: "test-server", transport: "stdio", env: ["API_KEY"] },
  };

  if (opts.useBin) {
    pkg.bin = { "test-server": "./dist/index.js" };
  } else if (opts.useMain) {
    pkg.main = "./dist/index.js";
  }

  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}

function makePythonProject(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "main.py"), "# python server");
  const toml = `[project]\nname = "py-server"\nversion = "0.2.0"\n[tool.mcp]\ntransport = "stdio"\n`;
  fs.writeFileSync(path.join(dir, "pyproject.toml"), toml);
}

// ── detectLocalServer — Node ───────────────────────────────────────────────────

describe("detectLocalServer — Node with bin field", () => {
  it("detects name and version from package.json", () => {
    const dir = path.join(tmpDir, "node-bin-server");
    makeNodeProject(dir, { useBin: true });
    const result = detectLocalServer(dir);
    expect(result.name).toBe("test-server");
    expect(result.version).toBe("1.2.3");
    expect(result.runtime).toBe("node");
  });

  it("uses node command for .js bin entry point", () => {
    const dir = path.join(tmpDir, "node-bin-js");
    makeNodeProject(dir, { useBin: true });
    const result = detectLocalServer(dir);
    expect(result.command).toBe("node");
    expect(result.args[0]).toContain("dist/index.js");
  });

  it("resolves to absolute path for args", () => {
    const dir = path.join(tmpDir, "node-abs");
    makeNodeProject(dir, { useBin: true });
    const result = detectLocalServer(dir);
    expect(path.isAbsolute(result.args[0])).toBe(true);
  });

  it("extracts envVars from mcp field", () => {
    const dir = path.join(tmpDir, "node-env");
    makeNodeProject(dir, { useBin: true });
    const result = detectLocalServer(dir);
    expect(result.envVars).toContain("API_KEY");
  });
});

describe("detectLocalServer — Node with main field", () => {
  it("uses main field when no bin present", () => {
    const dir = path.join(tmpDir, "node-main");
    makeNodeProject(dir, { useMain: true });
    const result = detectLocalServer(dir);
    expect(result.command).toBe("node");
    expect(result.args[0]).toContain("dist/index.js");
  });
});

describe("detectLocalServer — Node fallback to src/index.ts", () => {
  it("uses tsx for TypeScript entry point without bin/main", () => {
    const dir = path.join(tmpDir, "node-ts-fallback");
    makeNodeProject(dir, {}); // no bin or main
    const result = detectLocalServer(dir);
    expect(result.command).toBe("npx");
    expect(result.args).toContain("tsx");
  });
});

// ── detectLocalServer — Python ─────────────────────────────────────────────────

describe("detectLocalServer — Python", () => {
  it("detects Python project from pyproject.toml", () => {
    const dir = path.join(tmpDir, "py-server");
    makePythonProject(dir);
    const result = detectLocalServer(dir);
    expect(result.name).toBe("py-server");
    expect(result.runtime).toBe("python");
    expect(result.command).toContain("python");
  });

  it("points args to main.py", () => {
    const dir = path.join(tmpDir, "py-main");
    makePythonProject(dir);
    const result = detectLocalServer(dir);
    expect(result.args[0]).toContain("main.py");
  });
});

// ── detectLocalServer — error cases ───────────────────────────────────────────

describe("detectLocalServer — errors", () => {
  it("throws for nonexistent directory", () => {
    expect(() => detectLocalServer(path.join(tmpDir, "does-not-exist"))).toThrow(
      /does not exist/i,
    );
  });

  it("throws when neither package.json nor pyproject.toml present", () => {
    const dir = path.join(tmpDir, "empty-dir");
    fs.mkdirSync(dir);
    expect(() => detectLocalServer(dir)).toThrow(/No package.json/i);
  });
});

// ── registerLinkedServer ───────────────────────────────────────────────────────

describe("registerLinkedServer", () => {
  it("writes lockfile entry with source local", async () => {
    const lockPath = path.join(tmpDir, "mcpman.lock");
    const mockClient = {
      type: "cursor" as const,
      displayName: "Cursor",
      isInstalled: vi.fn().mockResolvedValue(true),
      getConfigPath: vi.fn().mockReturnValue("/tmp/cursor.json"),
      readConfig: vi.fn().mockResolvedValue({ servers: {} }),
      writeConfig: vi.fn().mockResolvedValue(undefined),
      addServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn().mockResolvedValue(undefined),
    };

    const linkResult = {
      name: "my-local",
      version: "1.0.0",
      command: "node",
      args: ["/abs/path/index.js"],
      envVars: [],
      absolutePath: "/abs/path",
      runtime: "node" as const,
    };

    const registered = await registerLinkedServer(linkResult, [mockClient], lockPath);
    expect(registered).toContain("cursor");

    const lockRaw = fs.readFileSync(lockPath, "utf-8");
    const lock = JSON.parse(lockRaw);
    expect(lock.servers["my-local"].source).toBe("local");
    expect(lock.servers["my-local"].resolved).toBe("/abs/path");
    expect(lock.servers["my-local"].integrity).toBe("local");
  });

  it("applies nameOverride when provided", async () => {
    const lockPath = path.join(tmpDir, "mcpman-override.lock");
    const mockClient = {
      type: "vscode" as const,
      displayName: "VSCode",
      isInstalled: vi.fn(),
      getConfigPath: vi.fn(),
      readConfig: vi.fn(),
      writeConfig: vi.fn(),
      addServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn(),
    };

    const linkResult = {
      name: "original-name",
      version: "0.1.0",
      command: "node",
      args: ["/some/path.js"],
      envVars: [],
      absolutePath: "/some",
      runtime: "node" as const,
    };

    await registerLinkedServer(linkResult, [mockClient], lockPath, "custom-name");

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.servers["custom-name"]).toBeDefined();
    expect(lock.servers["original-name"]).toBeUndefined();
  });
});
