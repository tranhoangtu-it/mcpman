import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import type { LockfileData } from "./lockfile.js";
import { type UpdateCheckCache, type UpdateInfo, checkAllVersions } from "./version-checker.js";

const CACHE_FILE = path.join(os.homedir(), ".mcpman", ".update-check");
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function readUpdateCache(): UpdateCheckCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as UpdateCheckCache;
  } catch {
    return null;
  }
}

export function writeUpdateCache(data: UpdateCheckCache): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    // Never crash main flow on cache write failure
  }
}

export function isCacheStale(cache: UpdateCheckCache): boolean {
  const lastCheck = new Date(cache.lastCheck).getTime();
  return Date.now() - lastCheck > TTL_MS;
}

// Background check — never throws, never blocks main flow
export function checkForUpdatesBackground(lockfile: LockfileData): void {
  const cache = readUpdateCache();
  if (cache && !isCacheStale(cache)) return;

  // Fire and forget — intentionally not awaited
  void (async () => {
    try {
      const updates = await checkAllVersions(lockfile);
      writeUpdateCache({ lastCheck: new Date().toISOString(), updates });
    } catch {
      // Silent failure — background check must never crash main flow
    }
  })();
}

// Show update banner to stderr if cached updates exist
export function showUpdateBanner(): void {
  const cache = readUpdateCache();
  if (!cache) return;

  const available = cache.updates.filter((u) => u.hasUpdate);
  if (available.length === 0) return;

  process.stderr.write("\n");
  process.stderr.write(
    pc.yellow(`  Update available: ${available.length} server(s) can be updated.\n`),
  );
  process.stderr.write(pc.dim(`  Run ${pc.cyan("mcpman update")} to upgrade.\n`));

  for (const u of available) {
    const typeTag = u.updateType ? pc.dim(` [${u.updateType}]`) : "";
    process.stderr.write(
      `  ${pc.dim("•")} ${u.server}: ${pc.red(u.currentVersion)} ${pc.dim("→")} ${pc.green(u.latestVersion)}${typeTag}\n`,
    );
  }

  process.stderr.write("\n");
}

// Full check (used by update command after applying updates)
export async function checkForUpdates(lockfile: LockfileData): Promise<UpdateInfo[]> {
  const updates = await checkAllVersions(lockfile);
  writeUpdateCache({ lastCheck: new Date().toISOString(), updates });
  return updates;
}
