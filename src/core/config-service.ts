/**
 * config-service.ts
 * Persistent CLI configuration stored at ~/.mcpman/config.json.
 * Provides CRUD helpers: readConfig, writeConfig, getConfigValue,
 * setConfigValue, deleteConfigValue.
 * Uses atomic write (.tmp + rename) — same pattern as vault-service.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { getConfigPath } from "../utils/paths.js";

// ── Types ──────────────────────────────────────────────────────────────────

/** All keys are optional — missing = use built-in default. */
export interface ConfigData {
  /** Default client to install/manage servers for (e.g. "claude-desktop") */
  defaultClient?: string;
  /** How often to check for mcpman updates, in hours (default 24) */
  updateCheckInterval?: number;
  /** Preferred package registry: npm or smithery (default "npm") */
  preferredRegistry?: "npm" | "smithery";
  /** Idle minutes before vault re-prompts for password (default 30) */
  vaultTimeout?: number;
}

/** Valid config keys for type-safe lookups. */
const VALID_KEYS: ReadonlySet<keyof ConfigData> = new Set([
  "defaultClient",
  "updateCheckInterval",
  "preferredRegistry",
  "vaultTimeout",
]);

// ── File I/O ───────────────────────────────────────────────────────────────

/**
 * Read config from disk.
 * Returns empty object if file is missing or unparseable.
 */
export function readConfig(configPath = getConfigPath()): ConfigData {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ConfigData;
  } catch {
    return {};
  }
}

/**
 * Write config to disk atomically (.tmp then rename).
 * Creates ~/.mcpman directory if needed.
 */
export function writeConfig(data: ConfigData, configPath = getConfigPath()): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf-8" });
  fs.renameSync(tmp, configPath);
}

// ── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Get a single config value by key.
 * Returns undefined if key is not set.
 */
export function getConfigValue(
  key: string,
  configPath = getConfigPath()
): unknown {
  const data = readConfig(configPath);
  if (!VALID_KEYS.has(key as keyof ConfigData)) return undefined;
  return data[key as keyof ConfigData];
}

/**
 * Set a single config value by key.
 * Persists full config back to disk after update.
 */
export function setConfigValue(
  key: string,
  value: unknown,
  configPath = getConfigPath()
): void {
  const data = readConfig(configPath);
  if (!VALID_KEYS.has(key as keyof ConfigData)) {
    throw new Error(`Unknown config key: "${key}". Valid keys: ${[...VALID_KEYS].join(", ")}`);
  }
  (data as Record<string, unknown>)[key] = value;
  writeConfig(data, configPath);
}

/**
 * Delete a single config key.
 * No-op if key not present.
 */
export function deleteConfigValue(
  key: string,
  configPath = getConfigPath()
): void {
  const data = readConfig(configPath);
  if (key in data) {
    delete (data as Record<string, unknown>)[key];
    writeConfig(data, configPath);
  }
}
