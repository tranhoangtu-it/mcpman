import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ClientType } from "../clients/types.js";

export const LOCKFILE_NAME = "mcpman.lock";

export interface LockEntry {
  version: string;
  source: "npm" | "smithery" | "github";
  resolved: string;
  integrity: string;
  runtime: "node" | "python" | "docker";
  command: string;
  args: string[];
  envVars: string[];
  installedAt: string;
  clients: ClientType[];
}

export interface LockfileData {
  lockfileVersion: 1;
  servers: Record<string, LockEntry>;
}

// Walk up from cwd to find mcpman.lock
export function findLockfile(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, LOCKFILE_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Global lockfile fallback path
export function getGlobalLockfilePath(): string {
  return path.join(os.homedir(), ".mcpman", LOCKFILE_NAME);
}

// Returns lockfile path: local if found, else global fallback
export function resolveLockfilePath(): string {
  return findLockfile() ?? getGlobalLockfilePath();
}

export function readLockfile(filePath?: string): LockfileData {
  const target = filePath ?? resolveLockfilePath();
  if (!fs.existsSync(target)) {
    return { lockfileVersion: 1, servers: {} };
  }
  try {
    const raw = fs.readFileSync(target, "utf-8");
    return JSON.parse(raw) as LockfileData;
  } catch {
    return { lockfileVersion: 1, servers: {} };
  }
}

// Serialize with sorted server keys for clean git diffs
function serialize(data: LockfileData): string {
  const sorted: LockfileData = {
    lockfileVersion: data.lockfileVersion,
    servers: Object.fromEntries(
      Object.entries(data.servers).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
  return JSON.stringify(sorted, null, 2) + "\n";
}

// Atomic write via temp file + rename
export function writeLockfile(data: LockfileData, filePath?: string): void {
  const target = filePath ?? resolveLockfilePath();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, serialize(data), "utf-8");
  fs.renameSync(tmp, target);
}

export function addEntry(
  name: string,
  entry: LockEntry,
  filePath?: string
): void {
  const data = readLockfile(filePath);
  data.servers[name] = entry;
  writeLockfile(data, filePath);
}

export function removeEntry(name: string, filePath?: string): void {
  const data = readLockfile(filePath);
  if (name in data.servers) {
    delete data.servers[name];
    writeLockfile(data, filePath);
  }
}

export function getLockedVersion(
  name: string,
  filePath?: string
): string | undefined {
  const data = readLockfile(filePath);
  return data.servers[name]?.version;
}

export function createEmptyLockfile(filePath: string): void {
  writeLockfile({ lockfileVersion: 1, servers: {} }, filePath);
}
