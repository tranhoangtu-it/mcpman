/**
 * why-service.ts
 * Collects server provenance data: lockfile entry, client registration status,
 * profile cross-references, and orphaned server detection.
 * All data from local files — no network calls.
 */

import fs from "node:fs";
import path from "node:path";
import type { ClientType } from "../clients/types.js";
import { getProfilesDir } from "../utils/paths.js";
import type { LockEntry } from "./lockfile.js";
import { readLockfile } from "./lockfile.js";
import type { Profile } from "./profile-service.js";

export interface ClientStatus {
  type: ClientType;
  registered: boolean;
}

export interface WhyResult {
  name: string;
  version: string;
  source: string;
  resolved: string;
  integrity: string;
  installedAt: string;
  clients: ClientStatus[];
  profiles: string[];
  envVars: string[];
  orphaned: boolean;
}

const ALL_CLIENT_TYPES: ClientType[] = ["claude-desktop", "cursor", "vscode", "windsurf"];

/**
 * Collect full provenance for a server name.
 * Returns null if not found in lockfile or any client config.
 * Sets orphaned=true if found in client configs but not in lockfile.
 */
export async function getServerProvenance(
  serverName: string,
  lockfilePath?: string,
  profilesDir?: string,
): Promise<WhyResult | null> {
  const lockfile = readLockfile(lockfilePath);
  const entry: LockEntry | undefined = lockfile.servers[serverName];

  if (!entry) {
    // Check if orphaned (in client configs but not lockfile)
    const orphanedClients = await findOrphanedClients(serverName);
    // Only report orphaned if at least one client config actually has this server
    const anyRegistered = orphanedClients.some((c) => c.registered);
    if (!anyRegistered) return null;

    return {
      name: serverName,
      version: "unknown",
      source: "unknown",
      resolved: "",
      integrity: "",
      installedAt: "",
      clients: orphanedClients,
      profiles: [],
      envVars: [],
      orphaned: true,
    };
  }

  // Cross-reference lockfile clients with actual client configs
  const clientStatuses = await buildClientStatuses(serverName, entry.clients);

  // Scan profiles for cross-reference
  const profiles = scanProfiles(serverName, profilesDir ?? getProfilesDir());

  return {
    name: serverName,
    version: entry.version,
    source: entry.source,
    resolved: entry.resolved,
    integrity: entry.integrity,
    installedAt: entry.installedAt,
    clients: clientStatuses,
    profiles,
    envVars: entry.envVars ?? [],
    orphaned: false,
  };
}

/** Build client status list: all known clients with registered flag */
async function buildClientStatuses(
  serverName: string,
  lockfileClients: ClientType[],
): Promise<ClientStatus[]> {
  return ALL_CLIENT_TYPES.map((type) => ({
    type,
    registered: lockfileClients.includes(type),
  }));
}

/** Look for serverName in client configs without a lockfile entry */
async function findOrphanedClients(serverName: string): Promise<ClientStatus[]> {
  const { getInstalledClients } = await import("../clients/client-detector.js");
  const handlers = await getInstalledClients();
  const results: ClientStatus[] = [];

  for (const handler of handlers) {
    try {
      const config = await handler.readConfig();
      const registered = serverName in (config.servers ?? {});
      results.push({ type: handler.type, registered });
    } catch {
      results.push({ type: handler.type, registered: false });
    }
  }

  return results;
}

/** Scan profiles directory and return names of profiles that contain the server */
export function scanProfiles(serverName: string, profilesDir: string): string[] {
  const found: string[] = [];

  if (!fs.existsSync(profilesDir)) return found;

  let files: string[];
  try {
    files = fs.readdirSync(profilesDir).filter((f) => f.endsWith(".json"));
  } catch {
    return found;
  }

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(profilesDir, file), "utf-8");
      const profile = JSON.parse(raw) as Profile;
      if (serverName in (profile.servers ?? {})) {
        found.push(profile.name ?? file.replace(".json", ""));
      }
    } catch {
      // Skip unreadable profiles
    }
  }

  return found.sort();
}

/** Format WhyResult as human-readable string */
export function formatWhyOutput(result: WhyResult): string {
  const lines: string[] = [];

  lines.push(`  Server: ${result.name}`);
  lines.push(`  Version: ${result.version}`);
  lines.push(`  Source: ${result.source}`);
  if (result.resolved) lines.push(`  Resolved: ${result.resolved}`);
  if (result.integrity && result.integrity !== "local") {
    lines.push(`  Integrity: ${result.integrity}`);
  }
  if (result.installedAt) lines.push(`  Installed: ${result.installedAt}`);

  lines.push("");
  lines.push("  Clients:");
  for (const c of result.clients) {
    const status = c.registered ? "registered" : "not registered";
    lines.push(`    ${c.type.padEnd(20)} ${status}`);
  }

  if (result.profiles.length > 0) {
    lines.push("");
    lines.push("  Profiles:");
    for (const p of result.profiles) {
      lines.push(`    ${p}`);
    }
  }

  if (result.envVars.length > 0) {
    lines.push("");
    lines.push("  Env Vars:");
    for (const v of result.envVars) {
      lines.push(`    ${v}`);
    }
  }

  return lines.join("\n");
}
