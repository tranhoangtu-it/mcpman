import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LockEntry } from "./lockfile.js";

export interface VulnInfo {
  severity: "low" | "moderate" | "high" | "critical";
  title: string;
  url?: string;
}

export interface PackageMetadata {
  weeklyDownloads: number;
  lastPublish: string; // ISO date
  packageAge: number;  // days since first publish
  maintainerCount: number;
  deprecated: boolean;
}

export interface SecurityReport {
  server: string;
  source: "npm" | "smithery" | "github";
  score: number | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  vulnerabilities: VulnInfo[];
  metadata: PackageMetadata | null;
}

const CACHE_PATH = path.join(os.homedir(), ".mcpman", ".audit-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  report: SecurityReport;
  timestamp: number;
}

type AuditCache = Record<string, CacheEntry>;

// Read cache from disk
function readCache(): AuditCache {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as AuditCache;
  } catch {
    return {};
  }
}

// Write cache to disk atomically
function writeCache(cache: AuditCache): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf-8");
  fs.renameSync(tmp, CACHE_PATH);
}

// Get cached report if fresh, null if stale/missing
export function getCachedReport(name: string, version: string): SecurityReport | null {
  const cache = readCache();
  const key = `${name}@${version}`;
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry.report;
}

// Save report to cache
function cacheReport(name: string, version: string, report: SecurityReport): void {
  const cache = readCache();
  cache[`${name}@${version}`] = { report, timestamp: Date.now() };
  writeCache(cache);
}

// Fetch npm registry metadata + downloads
export async function fetchNpmMetadata(packageName: string): Promise<PackageMetadata | null> {
  const timeout = 10_000;
  const signal = AbortSignal.timeout(timeout);
  try {
    const [regRes, dlRes] = await Promise.all([
      fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, { signal }),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`, {
        signal: AbortSignal.timeout(timeout),
      }),
    ]);

    if (!regRes.ok) return null;
    const reg = await regRes.json() as Record<string, unknown>;

    const time = (reg["time"] ?? {}) as Record<string, string>;
    const created = time["created"] ? new Date(time["created"]) : null;
    const modified = time["modified"] ? new Date(time["modified"]) : null;
    const packageAge = created ? Math.floor((Date.now() - created.getTime()) / 86_400_000) : 0;

    const maintainers = Array.isArray(reg["maintainers"]) ? reg["maintainers"] : [];
    const latestVersion = (reg["dist-tags"] as Record<string, string> | undefined)?.["latest"] ?? "";
    const versionData = (reg["versions"] as Record<string, Record<string, unknown>> | undefined)?.[latestVersion];
    const deprecated = typeof versionData?.["deprecated"] === "string";

    let weeklyDownloads = 0;
    if (dlRes.ok) {
      const dl = await dlRes.json() as Record<string, unknown>;
      weeklyDownloads = typeof dl["downloads"] === "number" ? dl["downloads"] : 0;
    }

    return {
      weeklyDownloads,
      lastPublish: modified?.toISOString() ?? new Date().toISOString(),
      packageAge,
      maintainerCount: maintainers.length,
      deprecated,
    };
  } catch {
    return null;
  }
}

// Fetch vulnerabilities via OSV API
export async function fetchVulnerabilities(packageName: string, version: string): Promise<VulnInfo[]> {
  try {
    const res = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: { name: packageName, ecosystem: "npm" }, version }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    const vulns = Array.isArray(data["vulns"]) ? data["vulns"] : [];
    return vulns.map((v: Record<string, unknown>) => {
      const severity = (v["database_specific"] as Record<string, unknown> | undefined)?.["severity"];
      const sev = (typeof severity === "string" ? severity.toLowerCase() : "moderate") as VulnInfo["severity"];
      const refs = Array.isArray(v["references"]) ? v["references"] : [];
      return {
        severity: ["low", "moderate", "high", "critical"].includes(sev) ? sev : "moderate",
        title: typeof v["summary"] === "string" ? v["summary"] : (typeof v["id"] === "string" ? v["id"] : "Unknown vulnerability"),
        url: typeof (refs[0] as Record<string, unknown> | undefined)?.["url"] === "string"
          ? (refs[0] as Record<string, unknown>)["url"] as string
          : undefined,
      } as VulnInfo;
    });
  } catch {
    return [];
  }
}

// Scan a single server, using cache if available
export async function scanServer(name: string, entry: LockEntry): Promise<SecurityReport> {
  if (entry.source !== "npm") {
    return {
      server: name,
      source: entry.source,
      score: null,
      riskLevel: "UNKNOWN",
      vulnerabilities: [],
      metadata: null,
    };
  }

  const cached = getCachedReport(name, entry.version);
  if (cached) return cached;

  const [metadata, vulnerabilities] = await Promise.all([
    fetchNpmMetadata(name),
    fetchVulnerabilities(name, entry.version),
  ]);

  const { computeTrustScore } = await import("./trust-scorer.js");
  const { score, riskLevel } = computeTrustScore(metadata, vulnerabilities);

  const report: SecurityReport = {
    server: name,
    source: "npm",
    score,
    riskLevel,
    vulnerabilities,
    metadata,
  };

  cacheReport(name, entry.version, report);
  return report;
}

// Scan all servers with concurrency limit
export async function scanAllServers(
  servers: Record<string, LockEntry>,
  concurrency = 3
): Promise<SecurityReport[]> {
  const entries = Object.entries(servers);
  const results: SecurityReport[] = [];
  const executing = new Set<Promise<void>>();

  for (const [name, entry] of entries) {
    const p = scanServer(name, entry).then((r) => {
      results.push(r);
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= concurrency) await Promise.race(executing);
  }

  await Promise.all(executing);
  return results;
}
