/**
 * integration-v07.test.ts
 * Cross-feature integration tests for v0.7.0 features:
 * create, link, watch, registry, completions, why.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateNodeProject, generatePythonProject, writeScaffold } from "../../src/core/scaffold-service.js";
import { detectLocalServer } from "../../src/core/link-service.js";
import { getRegistries, addRegistry, removeRegistry } from "../../src/core/registry-manager.js";
import { getCommandList, getServerNames } from "../../src/core/completion-generator.js";
import { getServerProvenance } from "../../src/core/why-service.js";
import { APP_VERSION } from "../../src/utils/constants.js";
import { readLockfile, writeLockfile } from "../../src/core/lockfile.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-v07-integration-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ── Version ────────────────────────────────────────────────────────────────────

describe("version", () => {
  it("APP_VERSION is 1.0.0", () => {
    expect(APP_VERSION).toBe("1.0.0");
  });
});

// ── create → link cycle ────────────────────────────────────────────────────────

describe("create → link integration", () => {
  it("scaffolds Node project and detects it via link-service", () => {
    const opts = {
      name: "test-integration-server",
      description: "Integration test server",
      runtime: "node" as const,
      transport: "stdio" as const,
    };

    const files = generateNodeProject(opts);
    const serverDir = path.join(tmpDir, opts.name);
    writeScaffold(serverDir, files);

    // link-service should detect the scaffolded project
    const result = detectLocalServer(serverDir);
    expect(result.name).toBe("test-integration-server");
    expect(result.runtime).toBe("node");
  });

  it("scaffolds Python project and detects it via link-service", () => {
    const opts = {
      name: "test-py-server",
      description: "Python integration server",
      runtime: "python" as const,
      transport: "stdio" as const,
    };

    const files = generatePythonProject(opts);
    const serverDir = path.join(tmpDir, opts.name);
    writeScaffold(serverDir, files);

    const result = detectLocalServer(serverDir);
    expect(result.name).toBe("test-py-server");
    expect(result.runtime).toBe("python");
  });
});

// ── registry add + list roundtrip ─────────────────────────────────────────────

describe("registry CRUD roundtrip", () => {
  it("add then list returns new registry", () => {
    const configPath = path.join(tmpDir, "config.json");
    addRegistry("test-reg", "https://test.example.com/api", configPath);

    const registries = getRegistries(configPath);
    const found = registries.find((r) => r.name === "test-reg");
    expect(found).toBeDefined();
    expect(found!.url).toBe("https://test.example.com/api");
  });

  it("remove after add cleans up registry", () => {
    const configPath = path.join(tmpDir, "config.json");
    addRegistry("temp-reg", "https://temp.example.com", configPath);
    removeRegistry("temp-reg", configPath);

    const registries = getRegistries(configPath);
    expect(registries.find((r) => r.name === "temp-reg")).toBeUndefined();
  });
});

// ── completions --list-commands ────────────────────────────────────────────────

describe("completions list", () => {
  it("--list-commands includes all 32 commands", () => {
    const cmds = getCommandList();
    expect(cmds).toHaveLength(32);

    // All v0.7 commands present
    const v07 = ["create", "link", "watch", "registry", "completions", "why"];
    for (const cmd of v07) {
      expect(cmds).toContain(cmd);
    }
  });

  it("--list-servers reads from lockfile", () => {
    const lockPath = path.join(tmpDir, "mcpman.lock");
    writeLockfile(
      {
        lockfileVersion: 1,
        servers: {
          "srv-alpha": {
            version: "1.0.0",
            source: "local",
            resolved: "/tmp/alpha",
            integrity: "local",
            runtime: "node",
            command: "node",
            args: ["/tmp/alpha/index.js"],
            envVars: [],
            installedAt: new Date().toISOString(),
            clients: [],
          },
        },
      },
      lockPath,
    );

    const names = getServerNames(lockPath);
    expect(names).toContain("srv-alpha");
  });
});

// ── why with linked server (source "local") ────────────────────────────────────

describe("why — local source server", () => {
  it("shows source local for linked server", async () => {
    const lockPath = path.join(tmpDir, "mcpman.lock");
    const profilesDir = path.join(tmpDir, "profiles");
    fs.mkdirSync(profilesDir);

    writeLockfile(
      {
        lockfileVersion: 1,
        servers: {
          "local-dev-server": {
            version: "0.1.0",
            source: "local",
            resolved: "/abs/path/to/server",
            integrity: "local",
            runtime: "node",
            command: "npx",
            args: ["tsx", "/abs/path/to/server/src/index.ts"],
            envVars: [],
            installedAt: new Date().toISOString(),
            clients: ["claude-desktop"],
          },
        },
      },
      lockPath,
    );

    const result = await getServerProvenance("local-dev-server", lockPath, profilesDir);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("local");
    expect(result!.resolved).toBe("/abs/path/to/server");
    expect(result!.orphaned).toBe(false);
  });
});

// ── lockfile source type includes "local" ──────────────────────────────────────

describe("lockfile backward compatibility", () => {
  it("reads lockfile with local source without error", () => {
    const lockPath = path.join(tmpDir, "mcpman-local.lock");
    const data = {
      lockfileVersion: 1 as const,
      servers: {
        "my-local": {
          version: "1.0.0",
          source: "local" as const,
          resolved: "/some/path",
          integrity: "local",
          runtime: "node" as const,
          command: "node",
          args: ["/some/path/index.js"],
          envVars: [],
          installedAt: new Date().toISOString(),
          clients: [] as import("../../src/clients/types.js").ClientType[],
        },
      },
    };

    writeLockfile(data, lockPath);
    const read = readLockfile(lockPath);
    expect(read.servers["my-local"].source).toBe("local");
  });
});
