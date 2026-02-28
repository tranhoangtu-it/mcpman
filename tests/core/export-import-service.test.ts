/**
 * export-import-service.test.ts
 * Unit tests for export bundle creation, validation, and import.
 * Uses temp directories and mocked config/lockfile/vault.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;
let configPath: string;
let lockfilePath: string;
let vaultPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-export-test-"));
  configPath = path.join(tmpDir, "config.json");
  lockfilePath = path.join(tmpDir, "mcpman.lock");
  vaultPath = path.join(tmpDir, "vault.enc");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Mock dependencies to use temp paths
vi.mock("../../src/utils/paths.js", () => ({
  getConfigPath: () => configPath,
  getMcpmanDir: () => tmpDir,
  getPluginDir: () => path.join(tmpDir, "plugins"),
  getHomedir: () => tmpDir,
  getAppDataDir: () => tmpDir,
  resolveConfigPath: () => configPath,
}));

vi.mock("../../src/core/config-service.js", async () => {
  const getConfigPath = () => configPath;
  return {
    readConfig: (p = getConfigPath()) => {
      try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch { return {}; }
    },
    writeConfig: (data: unknown, p = getConfigPath()) => {
      const dir = path.dirname(p);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(data, null, 2));
    },
    getConfigValue: () => undefined,
    setConfigValue: () => {},
    deleteConfigValue: () => {},
  };
});

vi.mock("../../src/core/lockfile.js", () => ({
  readLockfile: (p?: string) => {
    const target = p ?? lockfilePath;
    try {
      return JSON.parse(fs.readFileSync(target, "utf-8"));
    } catch { return { lockfileVersion: 1, servers: {} }; }
  },
  writeLockfile: (data: unknown, p?: string) => {
    const target = p ?? lockfilePath;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data, null, 2));
  },
  resolveLockfilePath: () => lockfilePath,
}));

vi.mock("../../src/core/vault-service.js", () => ({
  readVault: (p?: string) => {
    const target = p ?? vaultPath;
    try {
      return JSON.parse(fs.readFileSync(target, "utf-8"));
    } catch { return { version: 1, servers: {} }; }
  },
  writeVault: (data: unknown, p?: string) => {
    const target = p ?? vaultPath;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data, null, 2));
  },
  getVaultPath: () => vaultPath,
}));

vi.mock("../../src/core/plugin-loader.js", () => ({
  installPluginPackage: vi.fn(),
  loadAllPlugins: () => [],
  loadPlugin: () => null,
  listPluginPackages: () => [],
  removePluginPackage: vi.fn(),
}));

import {
  createExportBundle,
  validateBundle,
  importBundle,
  type ExportBundle,
} from "../../src/core/export-import-service.js";
import { writeConfig } from "../../src/core/config-service.js";
import { writeLockfile } from "../../src/core/lockfile.js";
import { writeVault } from "../../src/core/vault-service.js";
import { installPluginPackage } from "../../src/core/plugin-loader.js";

// ── createExportBundle ─────────────────────────────────────────────────────

describe("createExportBundle()", () => {
  it("creates bundle with config and lockfile", () => {
    writeConfig({ defaultClient: "cursor" });
    writeLockfile({ lockfileVersion: 1, servers: { "test-server": { version: "1.0.0" } } } as any);

    const bundle = createExportBundle();
    expect(bundle.mcpmanVersion).toBe("0.7.0");
    expect(bundle.exportedAt).toBeTruthy();
    expect(bundle.config.defaultClient).toBe("cursor");
    expect(bundle.lockfile.servers["test-server"]).toBeDefined();
  });

  it("includes vault when present and includeVault=true", () => {
    writeConfig({});
    writeLockfile({ lockfileVersion: 1, servers: {} });
    writeVault({ version: 1, servers: { s: { KEY: { salt: "a", iv: "b", data: "c" } } } } as any);

    const bundle = createExportBundle({ includeVault: true });
    expect(bundle.vault).toBeDefined();
    expect(bundle.vault!.version).toBe(1);
  });

  it("excludes vault when includeVault=false", () => {
    writeConfig({});
    writeLockfile({ lockfileVersion: 1, servers: {} });
    writeVault({ version: 1, servers: {} } as any);

    const bundle = createExportBundle({ includeVault: false });
    expect(bundle.vault).toBeUndefined();
  });

  it("includes plugins when present", () => {
    writeConfig({ plugins: ["plugin-a", "plugin-b"] });
    writeLockfile({ lockfileVersion: 1, servers: {} });

    const bundle = createExportBundle({ includePlugins: true });
    expect(bundle.plugins).toEqual(["plugin-a", "plugin-b"]);
  });

  it("excludes plugins when includePlugins=false", () => {
    writeConfig({ plugins: ["plugin-a"] });
    writeLockfile({ lockfileVersion: 1, servers: {} });

    const bundle = createExportBundle({ includePlugins: false });
    expect(bundle.plugins).toBeUndefined();
  });
});

// ── validateBundle ─────────────────────────────────────────────────────────

describe("validateBundle()", () => {
  const validBundle: ExportBundle = {
    mcpmanVersion: "0.5.0",
    exportedAt: new Date().toISOString(),
    config: {},
    lockfile: { lockfileVersion: 1, servers: {} },
  };

  it("returns null for valid bundle", () => {
    expect(validateBundle(validBundle)).toBeNull();
  });

  it("rejects non-object", () => {
    expect(validateBundle("string")).not.toBeNull();
    expect(validateBundle(null)).not.toBeNull();
    expect(validateBundle([])).not.toBeNull();
  });

  it("rejects missing mcpmanVersion", () => {
    const { mcpmanVersion: _, ...rest } = validBundle;
    expect(validateBundle(rest)).toContain("mcpmanVersion");
  });

  it("rejects missing exportedAt", () => {
    const { exportedAt: _, ...rest } = validBundle;
    expect(validateBundle(rest)).toContain("exportedAt");
  });

  it("rejects missing config", () => {
    const { config: _, ...rest } = validBundle;
    expect(validateBundle(rest)).toContain("config");
  });

  it("rejects missing lockfile", () => {
    const { lockfile: _, ...rest } = validBundle;
    expect(validateBundle(rest)).toContain("lockfile");
  });

  it("rejects unsupported lockfile version", () => {
    expect(validateBundle({ ...validBundle, lockfile: { lockfileVersion: 2, servers: {} } })).toContain("lockfile version");
  });
});

// ── importBundle ───────────────────────────────────────────────────────────

describe("importBundle()", () => {
  const bundle: ExportBundle = {
    mcpmanVersion: "0.5.0",
    exportedAt: new Date().toISOString(),
    config: { defaultClient: "windsurf", vaultTimeout: 60 },
    lockfile: {
      lockfileVersion: 1,
      servers: {
        "server-a": { version: "1.0.0" } as any,
        "server-b": { version: "2.0.0" } as any,
      },
    },
  };

  it("dry-run returns summary without writing", () => {
    const summary = importBundle(bundle, { dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.configKeys).toBe(2);
    expect(summary.servers).toBe(2);
    // Config should NOT have been written
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("writes config and lockfile on real import", () => {
    const summary = importBundle(bundle);
    expect(summary.dryRun).toBe(false);
    expect(summary.configKeys).toBe(2);
    expect(summary.servers).toBe(2);

    // Check files were written
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.defaultClient).toBe("windsurf");

    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
    expect(lockfile.servers["server-a"]).toBeDefined();
  });

  it("imports vault when present", () => {
    const bundleWithVault: ExportBundle = {
      ...bundle,
      vault: { version: 1, servers: { s: { KEY: { salt: "a", iv: "b", data: "c" } } } },
    };

    const summary = importBundle(bundleWithVault);
    expect(summary.vaultImported).toBe(true);
    expect(fs.existsSync(vaultPath)).toBe(true);
  });

  it("installs plugins when present", () => {
    const bundleWithPlugins: ExportBundle = {
      ...bundle,
      plugins: ["plugin-x", "plugin-y"],
    };

    const summary = importBundle(bundleWithPlugins);
    expect(summary.pluginsInstalled).toBe(2);
    expect(installPluginPackage).toHaveBeenCalledTimes(2);
  });

  it("counts failed plugin installs as 0", () => {
    vi.mocked(installPluginPackage).mockImplementation(() => { throw new Error("fail"); });

    const bundleWithPlugins: ExportBundle = {
      ...bundle,
      plugins: ["bad-plugin"],
    };

    const summary = importBundle(bundleWithPlugins);
    expect(summary.pluginsInstalled).toBe(0);
  });

  it("roundtrip: export then import preserves data", () => {
    // Write initial state
    writeConfig({ preferredRegistry: "smithery" } as any);
    writeLockfile({ lockfileVersion: 1, servers: { foo: { version: "3.0.0" } } } as any);

    // Export
    const exported = createExportBundle({ includeVault: false, includePlugins: false });

    // Clear state
    writeConfig({});
    writeLockfile({ lockfileVersion: 1, servers: {} });

    // Import
    importBundle(exported);

    // Verify
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.preferredRegistry).toBe("smithery");

    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
    expect(lockfile.servers.foo.version).toBe("3.0.0");
  });
});
