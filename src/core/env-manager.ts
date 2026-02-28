/**
 * env-manager.ts
 * Per-server plain JSON env var store at ~/.mcpman/env/<server>.json
 * NOT encrypted — use `secrets` for sensitive values.
 */

import fs from "node:fs";
import path from "node:path";
import { getEnvDir } from "../utils/paths.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EnvStore = Record<string, string>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function envFilePath(server: string, dir?: string): string {
  const base = dir ?? getEnvDir();
  // Sanitize server name for use as filename (replace / and @ with _)
  const safe = server.replace(/[/@]/g, "_");
  return path.join(base, `${safe}.json`);
}

function readStore(server: string, dir?: string): EnvStore {
  const file = envFilePath(server, dir);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as EnvStore;
  } catch {
    return {};
  }
}

function writeStore(server: string, store: EnvStore, dir?: string): void {
  const base = dir ?? getEnvDir();
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  const file = envFilePath(server, dir);
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Set a key=value for a server */
export function setEnv(server: string, key: string, value: string, dir?: string): void {
  const store = readStore(server, dir);
  store[key] = value;
  writeStore(server, store, dir);
}

/** Get a single env var value; returns null if missing */
export function getEnv(server: string, key: string, dir?: string): string | null {
  const store = readStore(server, dir);
  return key in store ? store[key] : null;
}

/** List all env vars for a server */
export function listEnv(server: string, dir?: string): EnvStore {
  return readStore(server, dir);
}

/** Delete a single env var key; no-op if missing */
export function deleteEnv(server: string, key: string, dir?: string): void {
  const store = readStore(server, dir);
  if (!(key in store)) return;
  delete store[key];
  writeStore(server, store, dir);
}

/** Clear all env vars for a server (removes the file) */
export function clearEnv(server: string, dir?: string): void {
  const file = envFilePath(server, dir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

/** List all servers that have env vars stored */
export function listEnvServers(dir?: string): string[] {
  const base = dir ?? getEnvDir();
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));
}
