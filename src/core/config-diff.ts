/**
 * config-diff.ts
 * Computes the diff between lockfile (intended state) and client configs (actual state).
 * Produces a list of SyncActions: add | extra | ok per server+client pair.
 */

import type { ClientConfig, ClientType, ServerEntry } from "../clients/types.js";
import type { LockEntry, LockfileData } from "./lockfile.js";

export type SyncActionType = "add" | "extra" | "remove" | "ok";

export interface SyncAction {
  server: string;
  client: ClientType;
  action: SyncActionType;
  /** Entry to add — only populated for "add" actions */
  entry?: ServerEntry;
}

/**
 * Reconstruct a ServerEntry from a LockEntry.
 * Note: env var *values* are not stored in the lockfile, only names.
 * We emit empty strings as placeholders; the user must supply values.
 */
export function reconstructServerEntry(lockEntry: LockEntry): ServerEntry {
  const entry: ServerEntry = {
    command: lockEntry.command,
  };
  if (lockEntry.args && lockEntry.args.length > 0) {
    entry.args = lockEntry.args;
  }
  if (lockEntry.envVars && lockEntry.envVars.length > 0) {
    // Values unknown — placeholder empty strings
    entry.env = Object.fromEntries(lockEntry.envVars.map((k) => [k, ""]));
  }
  return entry;
}

export interface DiffOptions {
  /** When true, converts "extra" actions to "remove" actions */
  remove?: boolean;
}

/**
 * computeDiff — lockfile is canonical source of truth.
 * - server in lockfile but not in client -> "add"
 * - server in client but not in lockfile -> "extra" (or "remove" if options.remove)
 * - server in both -> "ok"
 */
export function computeDiff(
  lockfile: LockfileData,
  clientConfigs: Map<ClientType, ClientConfig>,
  options: DiffOptions = {},
): SyncAction[] {
  const actions: SyncAction[] = [];

  // Pass 1: lockfile -> find missing in each intended client
  for (const [server, lockEntry] of Object.entries(lockfile.servers)) {
    for (const client of lockEntry.clients) {
      const config = clientConfigs.get(client);
      if (!config) continue; // client not detected/readable — skip

      if (server in config.servers) {
        actions.push({ server, client, action: "ok" });
      } else {
        actions.push({
          server,
          client,
          action: "add",
          entry: reconstructServerEntry(lockEntry),
        });
      }
    }
  }

  // Pass 2: client configs -> find servers not in lockfile
  const extraAction = options.remove ? "remove" : "extra";
  for (const [client, config] of clientConfigs) {
    for (const server of Object.keys(config.servers)) {
      if (!(server in lockfile.servers)) {
        actions.push({ server, client: client as ClientType, action: extraAction });
      }
    }
  }

  return actions;
}

/**
 * computeDiffFromClient — a specific client config is the source of truth.
 * Servers in source that are missing from other clients -> "add".
 * Servers in target clients not in source -> "extra" (or "remove" if options.remove).
 */
export function computeDiffFromClient(
  sourceClient: ClientType,
  clientConfigs: Map<ClientType, ClientConfig>,
  options: DiffOptions = {},
): SyncAction[] {
  const actions: SyncAction[] = [];
  const sourceConfig = clientConfigs.get(sourceClient);
  if (!sourceConfig) return [];

  const extraAction = options.remove ? "remove" : "extra";

  for (const [client, config] of clientConfigs) {
    if (client === sourceClient) continue;

    // Servers in source missing from this client
    for (const [server, entry] of Object.entries(sourceConfig.servers)) {
      if (server in config.servers) {
        actions.push({ server, client: client as ClientType, action: "ok" });
      } else {
        actions.push({ server, client: client as ClientType, action: "add", entry });
      }
    }

    // Servers in this client not in source
    for (const server of Object.keys(config.servers)) {
      if (!(server in sourceConfig.servers)) {
        actions.push({ server, client: client as ClientType, action: extraAction });
      }
    }
  }

  return actions;
}
