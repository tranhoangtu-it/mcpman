/**
 * Shared server update logic extracted from update.ts.
 * Used by both `mcpman update` and `mcpman audit --fix`.
 */
import { addEntry } from "./lockfile.js";
import { resolveServer } from "./server-resolver.js";
import { computeIntegrity } from "./registry.js";
import type { LockEntry } from "./lockfile.js";
import type { ClientHandler } from "../clients/types.js";

export interface UpdateApplyResult {
  server: string;
  success: boolean;
  fromVersion: string;
  toVersion: string;
  error?: string;
}

/**
 * Apply a single server update:
 * 1. Resolve latest metadata from registry
 * 2. Update lockfile entry
 * 3. Re-write to each target client config
 *
 * Single client failure is non-fatal; resolveServer failure is fatal for the server.
 */
export async function applyServerUpdate(
  serverName: string,
  lockEntry: LockEntry,
  clients: ClientHandler[]
): Promise<UpdateApplyResult> {
  const fromVersion = lockEntry.version;

  // Determine input string matching the server's source
  const input =
    lockEntry.source === "smithery"
      ? `smithery:${serverName}`
      : lockEntry.source === "github"
        ? lockEntry.resolved
        : serverName;

  try {
    const metadata = await resolveServer(input);
    const integrity = computeIntegrity(metadata.resolved);

    // Update lockfile with new version info
    addEntry(serverName, {
      ...lockEntry,
      version: metadata.version,
      resolved: metadata.resolved,
      integrity,
      command: metadata.command,
      args: metadata.args,
      installedAt: new Date().toISOString(),
    });

    // Re-write to each client that had this server installed
    const targetClients = clients.filter((c) =>
      lockEntry.clients.includes(c.type)
    );
    for (const client of targetClients) {
      try {
        await client.addServer(serverName, {
          command: metadata.command,
          args: metadata.args,
        });
      } catch {
        // Non-fatal: client config update failed, lockfile already updated
      }
    }

    return {
      server: serverName,
      success: true,
      fromVersion,
      toVersion: metadata.version,
    };
  } catch (err) {
    return {
      server: serverName,
      success: false,
      fromVersion,
      toVersion: fromVersion,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
