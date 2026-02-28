/**
 * alias-manager.ts
 * Command aliases stored at ~/.mcpman/aliases.json
 * { [aliasName]: string } — value is the full command string
 */

import fs from "node:fs";
import { getAliasesFile } from "../utils/paths.js";

export type AliasStore = Record<string, string>;

// ── I/O ───────────────────────────────────────────────────────────────────────

function readAliases(file?: string): AliasStore {
  const target = file ?? getAliasesFile();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, "utf-8")) as AliasStore;
  } catch {
    return {};
  }
}

function writeAliases(store: AliasStore, file?: string): void {
  const target = file ?? getAliasesFile();
  const dir = target.substring(0, target.lastIndexOf("/"));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, JSON.stringify(store, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add or overwrite an alias */
export function addAlias(name: string, command: string, file?: string): void {
  const store = readAliases(file);
  store[name] = command;
  writeAliases(store, file);
}

/** Remove an alias (no-op if not found) */
export function removeAlias(name: string, file?: string): void {
  const store = readAliases(file);
  if (!(name in store)) return;
  delete store[name];
  writeAliases(store, file);
}

/** Get the command string for an alias, or null if not found */
export function getAlias(name: string, file?: string): string | null {
  return readAliases(file)[name] ?? null;
}

/** List all aliases as sorted array of {name, command} */
export function listAliases(file?: string): Array<{ name: string; command: string }> {
  const store = readAliases(file);
  return Object.entries(store)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, command]) => ({ name, command }));
}

/** Resolve an alias to its command string; returns null if not found */
export function resolveAlias(name: string, file?: string): string | null {
  return getAlias(name, file);
}

/** Returns true if alias exists */
export function aliasExists(name: string, file?: string): boolean {
  return name in readAliases(file);
}
