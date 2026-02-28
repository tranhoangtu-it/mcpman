/**
 * pin-service.ts
 * Version pinning for MCP servers stored at ~/.mcpman/pins.json
 * { [serverName]: string }  — maps server name to pinned version string
 */

import fs from "node:fs";
import { getPinsFile } from "../utils/paths.js";

export type PinStore = Record<string, string>;

// ── I/O ───────────────────────────────────────────────────────────────────────

function readPins(file?: string): PinStore {
  const target = file ?? getPinsFile();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, "utf-8")) as PinStore;
  } catch {
    return {};
  }
}

function writePins(store: PinStore, file?: string): void {
  const target = file ?? getPinsFile();
  const dir = target.slice(0, target.lastIndexOf("/"));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, JSON.stringify(store, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Pin a server to a specific version */
export function pinServer(server: string, version: string, file?: string): void {
  const store = readPins(file);
  store[server] = version;
  writePins(store, file);
}

/** Remove a pin for a server (no-op if not pinned) */
export function unpinServer(server: string, file?: string): void {
  const store = readPins(file);
  if (!(server in store)) return;
  delete store[server];
  writePins(store, file);
}

/** Get the pinned version for a server; returns null if not pinned */
export function getPinnedVersion(server: string, file?: string): string | null {
  return readPins(file)[server] ?? null;
}

/** Returns true if the server is pinned */
export function isPinned(server: string, file?: string): boolean {
  return server in readPins(file);
}

/** List all pinned servers and their versions */
export function listPins(file?: string): Array<{ server: string; version: string }> {
  const store = readPins(file);
  return Object.entries(store)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([server, version]) => ({ server, version }));
}
