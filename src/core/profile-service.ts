/**
 * profile-service.ts
 * Manages named profiles — snapshots of lockfile servers that can be
 * saved and restored to quickly switch between MCP server configurations.
 * Storage: ~/.mcpman/profiles/<name>.json
 */

import fs from "node:fs";
import path from "node:path";
import { getProfilesDir } from "../utils/paths.js";
import type { LockEntry } from "./lockfile.js";
import { readLockfile } from "./lockfile.js";

export interface Profile {
  name: string;
  description: string;
  createdAt: string;
  servers: Record<string, LockEntry>;
}

/** Ensure profiles directory exists */
function ensureDir(dir = getProfilesDir()): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Get file path for a profile by name */
function profilePath(name: string, dir = getProfilesDir()): string {
  return path.join(dir, `${name}.json`);
}

/**
 * Create a profile by snapshotting current lockfile servers.
 * Throws if profile already exists (use delete first).
 */
export function createProfile(name: string, description = "", dir = getProfilesDir()): Profile {
  ensureDir(dir);
  const filePath = profilePath(name, dir);

  if (fs.existsSync(filePath)) {
    throw new Error(`Profile '${name}' already exists. Delete it first or use a different name.`);
  }

  const lockfile = readLockfile();
  const profile: Profile = {
    name,
    description,
    createdAt: new Date().toISOString(),
    servers: lockfile.servers,
  };

  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}

/** List all saved profiles. */
export function listProfiles(dir = getProfilesDir()): Profile[] {
  ensureDir(dir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const profiles: Profile[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as Profile;
      profiles.push(data);
    } catch {
      // Skip corrupt profile files
    }
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

/** Load a single profile by name. Returns null if not found. */
export function loadProfile(name: string, dir = getProfilesDir()): Profile | null {
  const filePath = profilePath(name, dir);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

/** Delete a profile by name. Returns true if deleted, false if not found. */
export function deleteProfile(name: string, dir = getProfilesDir()): boolean {
  const filePath = profilePath(name, dir);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
