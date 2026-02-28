/**
 * create-command.test.ts
 * Tests for `mcpman create` command and scaffold-service.
 * Uses temp directories for file I/O tests; mocks prompts.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateNodeProject,
  generatePythonProject,
  sanitizeName,
  writeScaffold,
} from "../../src/core/scaffold-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-create-test-"));
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

// ── sanitizeName ───────────────────────────────────────────────────────────────

describe("sanitizeName", () => {
  it("lowercases and keeps hyphens", () => {
    expect(sanitizeName("My-Server")).toBe("my-server");
  });

  it("replaces spaces and special chars with hyphens", () => {
    // trailing special chars become trailing hyphens which are then stripped
    expect(sanitizeName("My Server!")).toBe("my-server");
  });

  it("collapses multiple hyphens", () => {
    expect(sanitizeName("my---server")).toBe("my-server");
  });

  it("strips leading/trailing hyphens", () => {
    expect(sanitizeName("-my-server-")).toBe("my-server");
  });
});

// ── generateNodeProject ────────────────────────────────────────────────────────

describe("generateNodeProject", () => {
  const opts = {
    name: "my-server",
    description: "A test MCP server",
    runtime: "node" as const,
    transport: "stdio" as const,
  };

  it("includes package.json with mcp field", () => {
    const files = generateNodeProject(opts);
    expect(files["package.json"]).toBeDefined();
    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.mcp).toBeDefined();
    expect(pkg.mcp.name).toBe("my-server");
    expect(pkg.mcp.transport).toBe("stdio");
  });

  it("includes bin field in package.json", () => {
    const files = generateNodeProject(opts);
    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["my-server"]).toBeDefined();
  });

  it("includes tsconfig.json", () => {
    const files = generateNodeProject(opts);
    expect(files["tsconfig.json"]).toBeDefined();
    const tsconfig = JSON.parse(files["tsconfig.json"]);
    expect(tsconfig.compilerOptions).toBeDefined();
  });

  it("includes src/index.ts with initialize handler", () => {
    const files = generateNodeProject(opts);
    expect(files["src/index.ts"]).toBeDefined();
    expect(files["src/index.ts"]).toContain("tools/list");
    expect(files["src/index.ts"]).toContain("tools/call");
  });

  it("embeds project name in generated server code", () => {
    const files = generateNodeProject(opts);
    expect(files["src/index.ts"]).toContain('"my-server"');
  });
});

// ── generatePythonProject ──────────────────────────────────────────────────────

describe("generatePythonProject", () => {
  const opts = {
    name: "my-py-server",
    description: "A Python MCP server",
    runtime: "python" as const,
    transport: "stdio" as const,
  };

  it("includes pyproject.toml with tool.mcp section", () => {
    const files = generatePythonProject(opts);
    expect(files["pyproject.toml"]).toBeDefined();
    expect(files["pyproject.toml"]).toContain("[tool.mcp]");
    expect(files["pyproject.toml"]).toContain("my-py-server");
  });

  it("includes main.py with list_tools and call_tool handlers", () => {
    const files = generatePythonProject(opts);
    expect(files["main.py"]).toBeDefined();
    expect(files["main.py"]).toContain("list_tools");
    expect(files["main.py"]).toContain("call_tool");
  });

  it("embeds project name in main.py", () => {
    const files = generatePythonProject(opts);
    expect(files["main.py"]).toContain('"my-py-server"');
  });
});

// ── writeScaffold ──────────────────────────────────────────────────────────────

describe("writeScaffold", () => {
  it("writes all files to target directory", () => {
    const dir = path.join(tmpDir, "new-project");
    const files = { "README.md": "# Hello", "src/index.ts": "console.log('hi')" };
    writeScaffold(dir, files);

    expect(fs.existsSync(path.join(dir, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src", "index.ts"))).toBe(true);
  });

  it("creates nested directories as needed", () => {
    const dir = path.join(tmpDir, "deep-project");
    writeScaffold(dir, { "a/b/c/file.txt": "content" });
    expect(fs.existsSync(path.join(dir, "a", "b", "c", "file.txt"))).toBe(true);
  });

  it("throws if target directory is non-empty", () => {
    const dir = path.join(tmpDir, "existing");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "existing.txt"), "data");

    expect(() => writeScaffold(dir, { "new.txt": "content" })).toThrow(/already exists/i);
  });

  it("succeeds if target directory exists but is empty", () => {
    const dir = path.join(tmpDir, "empty-dir");
    fs.mkdirSync(dir);
    writeScaffold(dir, { "file.txt": "content" });
    expect(fs.existsSync(path.join(dir, "file.txt"))).toBe(true);
  });
});
