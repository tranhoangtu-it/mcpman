/**
 * group-manager.ts
 * Server group tags stored at ~/.mcpman/groups.json
 * { [groupName]: string[] }
 */

import fs from "node:fs";
import { getGroupsFile } from "../utils/paths.js";

export type GroupStore = Record<string, string[]>;

// ── I/O ───────────────────────────────────────────────────────────────────────

function readGroups(file?: string): GroupStore {
  const target = file ?? getGroupsFile();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, "utf-8")) as GroupStore;
  } catch {
    return {};
  }
}

function writeGroups(store: GroupStore, file?: string): void {
  const target = file ?? getGroupsFile();
  const dir = target.slice(0, target.lastIndexOf("/"));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, JSON.stringify(store, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add servers to a group (deduplicates) */
export function addToGroup(group: string, servers: string[], file?: string): void {
  const store = readGroups(file);
  const existing = new Set(store[group] ?? []);
  for (const s of servers) existing.add(s);
  store[group] = [...existing].sort();
  writeGroups(store, file);
}

/** Remove servers from a group */
export function removeFromGroup(group: string, servers: string[], file?: string): void {
  const store = readGroups(file);
  if (!store[group]) return;
  const toRemove = new Set(servers);
  store[group] = store[group].filter((s) => !toRemove.has(s));
  if (store[group].length === 0) delete store[group];
  writeGroups(store, file);
}

/** Get members of a group; returns [] if not found */
export function getGroup(group: string, file?: string): string[] {
  return readGroups(file)[group] ?? [];
}

/** List all group names */
export function listGroups(file?: string): string[] {
  return Object.keys(readGroups(file)).sort();
}

/** Delete an entire group */
export function deleteGroup(group: string, file?: string): void {
  const store = readGroups(file);
  if (!(group in store)) return;
  delete store[group];
  writeGroups(store, file);
}

/** Returns true if group exists */
export function groupExists(group: string, file?: string): boolean {
  return group in readGroups(file);
}
