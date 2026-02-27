import type { LockEntry, LockfileData } from "./lockfile.js";

export interface UpdateInfo {
  server: string;
  source: "npm" | "smithery" | "github";
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  updateType?: "major" | "minor" | "patch";
}

export interface UpdateCheckCache {
  lastCheck: string; // ISO date
  updates: UpdateInfo[];
}

// Compare two semver strings: -1 if a < b, 0 if equal, 1 if a > b
// Non-numeric segments treated as opaque strings (equal unless different)
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const aParts = a.replace(/^v/, "").split(".").map(Number);
  const bParts = b.replace(/^v/, "").split(".").map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aN = aParts[i] ?? 0;
    const bN = bParts[i] ?? 0;
    if (Number.isNaN(aN) || Number.isNaN(bN)) return 0; // non-numeric: treat as equal
    if (aN < bN) return -1;
    if (aN > bN) return 1;
  }
  return 0;
}

// Determine update type from version diff
function detectUpdateType(current: string, latest: string): "major" | "minor" | "patch" {
  const cParts = current.replace(/^v/, "").split(".").map(Number);
  const lParts = latest.replace(/^v/, "").split(".").map(Number);
  if ((lParts[0] ?? 0) > (cParts[0] ?? 0)) return "major";
  if ((lParts[1] ?? 0) > (cParts[1] ?? 0)) return "minor";
  return "patch";
}

// Fetch latest version for an npm package
async function fetchNpmLatest(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

// Fetch latest version from Smithery registry
async function fetchSmitheryLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.smithery.ai/servers/${encodeURIComponent(name)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

// Fetch latest GitHub release tag
async function fetchGithubLatest(resolved: string): Promise<string | null> {
  const match = resolved.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  const [, owner, repo] = match;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return typeof data.tag_name === "string" ? data.tag_name.replace(/^v/, "") : null;
  } catch {
    return null;
  }
}

// Check a single server's latest version against its lockfile entry
export async function checkVersion(name: string, lockEntry: LockEntry): Promise<UpdateInfo> {
  const current = lockEntry.version;
  let latest: string | null = null;

  if (lockEntry.source === "npm") {
    latest = await fetchNpmLatest(name);
  } else if (lockEntry.source === "smithery") {
    latest = await fetchSmitheryLatest(name);
  } else if (lockEntry.source === "github") {
    latest = await fetchGithubLatest(lockEntry.resolved);
  }

  if (!latest || latest === current) {
    return {
      server: name,
      source: lockEntry.source,
      currentVersion: current,
      latestVersion: latest ?? current,
      hasUpdate: false,
    };
  }

  const hasUpdate = compareVersions(current, latest) === -1;
  return {
    server: name,
    source: lockEntry.source,
    currentVersion: current,
    latestVersion: latest,
    hasUpdate,
    updateType: hasUpdate ? detectUpdateType(current, latest) : undefined,
  };
}

// Run version checks in parallel (concurrency 5)
export async function checkAllVersions(lockfile: LockfileData): Promise<UpdateInfo[]> {
  const entries = Object.entries(lockfile.servers);
  if (entries.length === 0) return [];

  const results: UpdateInfo[] = [];
  const executing = new Set<Promise<void>>();

  for (const [name, entry] of entries) {
    const p = checkVersion(name, entry).then((r) => {
      results.push(r);
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= 5) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
