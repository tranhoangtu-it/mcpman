/**
 * export-import-service.ts
 * Creates portable export bundles and imports them to restore
 * mcpman config, lockfile, vault, and plugin registrations.
 */

import fs from "node:fs";
import { APP_VERSION } from "../utils/constants.js";
import type { ConfigData } from "./config-service.js";
import { readConfig, writeConfig } from "./config-service.js";
import type { LockfileData } from "./lockfile.js";
import { readLockfile, resolveLockfilePath, writeLockfile } from "./lockfile.js";
import { installPluginPackage } from "./plugin-loader.js";
import type { VaultData } from "./vault-service.js";
import { getVaultPath, readVault, writeVault } from "./vault-service.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExportBundle {
  mcpmanVersion: string;
  exportedAt: string;
  config: ConfigData;
  lockfile: LockfileData;
  /** Raw encrypted vault data — same password needed on import */
  vault?: VaultData;
  /** Plugin package names to re-install on import */
  plugins?: string[];
}

export interface ExportOptions {
  includeVault?: boolean;
  includePlugins?: boolean;
}

export interface ImportOptions {
  /** Skip confirmation prompts */
  yes?: boolean;
  /** Preview only — don't write anything */
  dryRun?: boolean;
}

export interface ImportSummary {
  configKeys: number;
  servers: number;
  vaultImported: boolean;
  pluginsInstalled: number;
  dryRun: boolean;
}

// ── Export ──────────────────────────────────────────────────────────────────

/** Create a full export bundle from current mcpman state. */
export function createExportBundle(opts: ExportOptions = {}): ExportBundle {
  const { includeVault = true, includePlugins = true } = opts;

  const config = readConfig();
  const lockfile = readLockfile();

  const bundle: ExportBundle = {
    mcpmanVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    config,
    lockfile,
  };

  if (includeVault) {
    const vaultPath = getVaultPath();
    if (fs.existsSync(vaultPath)) {
      bundle.vault = readVault();
    }
  }

  if (includePlugins && config.plugins && config.plugins.length > 0) {
    bundle.plugins = [...config.plugins];
  }

  return bundle;
}

// ── Import ─────────────────────────────────────────────────────────────────

/** Validate an export bundle structure. Returns error message or null if valid. */
export function validateBundle(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "Bundle must be a JSON object";
  }

  const bundle = data as Record<string, unknown>;

  if (typeof bundle.mcpmanVersion !== "string") {
    return "Missing or invalid mcpmanVersion field";
  }
  if (typeof bundle.exportedAt !== "string") {
    return "Missing or invalid exportedAt field";
  }
  if (typeof bundle.config !== "object" || bundle.config === null) {
    return "Missing or invalid config field";
  }
  if (typeof bundle.lockfile !== "object" || bundle.lockfile === null) {
    return "Missing or invalid lockfile field";
  }

  const lockfile = bundle.lockfile as Record<string, unknown>;
  if (lockfile.lockfileVersion !== 1) {
    return "Unsupported lockfile version";
  }

  return null;
}

/**
 * Import an export bundle. Overwrites existing config/lockfile.
 * Vault is imported as raw encrypted data (same password needed).
 * Plugins are re-installed via npm.
 */
export function importBundle(bundle: ExportBundle, opts: ImportOptions = {}): ImportSummary {
  const { dryRun = false } = opts;

  const summary: ImportSummary = {
    configKeys: Object.keys(bundle.config).length,
    servers: Object.keys(bundle.lockfile.servers).length,
    vaultImported: false,
    pluginsInstalled: 0,
    dryRun,
  };

  if (dryRun) {
    summary.vaultImported = !!bundle.vault;
    summary.pluginsInstalled = bundle.plugins?.length ?? 0;
    return summary;
  }

  // Write config
  writeConfig(bundle.config);

  // Write lockfile
  writeLockfile(bundle.lockfile, resolveLockfilePath());

  // Write vault (raw encrypted data)
  if (bundle.vault) {
    writeVault(bundle.vault);
    summary.vaultImported = true;
  }

  // Re-install plugins
  if (bundle.plugins && bundle.plugins.length > 0) {
    for (const pkg of bundle.plugins) {
      try {
        installPluginPackage(pkg);
        summary.pluginsInstalled++;
      } catch {
        // Skip failing plugin installs — logged by caller
      }
    }
  }

  return summary;
}
