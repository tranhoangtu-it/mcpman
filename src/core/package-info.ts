import { readLockfile } from "./lockfile.js";
import type { LockEntry } from "./lockfile.js";
import { fetchNpmMetadata } from "./security-scanner.js";
import { computeTrustScore } from "./trust-scorer.js";

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  source: "npm" | "smithery" | "github";
  runtime: string;
  envVars: string[];
  weeklyDownloads: number;
  maintainerCount: number;
  packageAge: number;
  lastPublish: string;
  deprecated: boolean;
  trustScore: number | null;
  riskLevel: string;
  installedClients: string[];
  isInstalled: boolean;
}

// Build PackageInfo from lockfile entry + optional npm metadata
async function buildInfo(
  name: string,
  entry: LockEntry | null,
  source: "npm" | "smithery" | "github" = "npm",
): Promise<PackageInfo | null> {
  // For non-npm sources without lockfile entry, cannot fetch metadata
  const resolvedSource = entry?.source ?? source;

  let weeklyDownloads = 0;
  let maintainerCount = 0;
  let packageAge = 0;
  let lastPublish = "";
  let deprecated = false;
  let trustScore: number | null = null;
  let riskLevel = "UNKNOWN";

  if (resolvedSource === "npm") {
    const metadata = await fetchNpmMetadata(name);
    if (!metadata && !entry) {
      // Package not found in npm and not installed
      return null;
    }
    if (metadata) {
      weeklyDownloads = metadata.weeklyDownloads;
      maintainerCount = metadata.maintainerCount;
      packageAge = metadata.packageAge;
      lastPublish = metadata.lastPublish;
      deprecated = metadata.deprecated;
      const scored = computeTrustScore(metadata, []);
      trustScore = scored.score;
      riskLevel = scored.riskLevel;
    }
  }

  return {
    name,
    version: entry?.version ?? "unknown",
    description: "",
    source: resolvedSource,
    runtime: entry?.runtime ?? "node",
    envVars: entry?.envVars ?? [],
    weeklyDownloads,
    maintainerCount,
    packageAge,
    lastPublish,
    deprecated,
    trustScore,
    riskLevel,
    installedClients: entry?.clients ?? [],
    isInstalled: entry !== null,
  };
}

// Main export: returns PackageInfo for installed or registry-only server
// Returns null if server not found in lockfile and npm registry returns 404
export async function getPackageInfo(serverName: string): Promise<PackageInfo | null> {
  const lockfile = readLockfile();
  const entry: LockEntry | null = lockfile.servers[serverName] ?? null;

  return buildInfo(serverName, entry);
}
