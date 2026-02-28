/**
 * config-differ.ts
 * Visual config diff between two AI clients.
 * Computes added/removed/changed servers by comparing their MCP configs.
 */

import type { ClientConfig, ClientType, ServerEntry } from "../clients/types.js";

export type DiffChangeType = "added" | "removed" | "changed";

export interface DiffResult {
  server: string;
  change: DiffChangeType;
  /** Present for "changed" — field-level diffs */
  details?: string[];
}

/**
 * Compare two ServerEntry objects; return list of changed field descriptions.
 * Returns empty array if entries are equivalent.
 */
function entryDiffs(a: ServerEntry, b: ServerEntry): string[] {
  const diffs: string[] = [];

  if (a.command !== b.command) {
    diffs.push(`command: ${a.command} → ${b.command}`);
  }

  const aArgs = JSON.stringify(a.args ?? []);
  const bArgs = JSON.stringify(b.args ?? []);
  if (aArgs !== bArgs) {
    diffs.push(`args: ${aArgs} → ${bArgs}`);
  }

  const aEnv = JSON.stringify(a.env ?? {});
  const bEnv = JSON.stringify(b.env ?? {});
  if (aEnv !== bEnv) {
    diffs.push(`env: ${aEnv} → ${bEnv}`);
  }

  return diffs;
}

/**
 * Compare configs from clientA (source) vs clientB (target).
 * - added: server in B but not A
 * - removed: server in A but not B
 * - changed: server in both but different command/args/env
 */
export function diffClientConfigs(configA: ClientConfig, configB: ClientConfig): DiffResult[] {
  const results: DiffResult[] = [];
  const serversA = configA.servers;
  const serversB = configB.servers;

  // Servers in B not in A → added
  for (const name of Object.keys(serversB)) {
    if (!(name in serversA)) {
      results.push({ server: name, change: "added" });
    }
  }

  // Servers in A not in B → removed
  for (const name of Object.keys(serversA)) {
    if (!(name in serversB)) {
      results.push({ server: name, change: "removed" });
    }
  }

  // Servers in both → check for changes
  for (const name of Object.keys(serversA)) {
    if (name in serversB) {
      const details = entryDiffs(serversA[name], serversB[name]);
      if (details.length > 0) {
        results.push({ server: name, change: "changed", details });
      }
    }
  }

  // Sort: removed first, then added, then changed, all alphabetical
  const order: Record<DiffChangeType, number> = { removed: 0, added: 1, changed: 2 };
  results.sort((a, b) => {
    const orderDiff = order[a.change] - order[b.change];
    return orderDiff !== 0 ? orderDiff : a.server.localeCompare(b.server);
  });

  return results;
}

/**
 * Load configs for two named clients using their handlers.
 * Returns null for each side if the client cannot be read.
 */
export async function loadClientConfig(type: ClientType): Promise<ClientConfig | null> {
  try {
    const { getClient } = await import("../clients/client-detector.js");
    const handler = getClient(type);
    return await handler.readConfig();
  } catch {
    return null;
  }
}
