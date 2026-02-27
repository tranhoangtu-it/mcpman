/**
 * sync-engine.ts
 * Applies SyncActions to client configs — reads client configs from disk,
 * applies "add" actions via ClientHandler.addServer(), returns results.
 */

import type { ClientHandler, ClientType, ClientConfig } from "../clients/types.js";
import { getInstalledClients } from "../clients/client-detector.js";
import type { SyncAction } from "./config-diff.js";

export interface ApplyResult {
  applied: number;
  failed: number;
  errors: Array<{ server: string; client: ClientType; error: string }>;
}

/**
 * applySyncActions — write "add" actions to each client config.
 * Skips "extra" and "ok" actions. Catches per-client errors and continues.
 */
export async function applySyncActions(
  actions: SyncAction[],
  clients: Map<ClientType, ClientHandler>
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, failed: 0, errors: [] };
  const addActions = actions.filter((a) => a.action === "add" && a.entry);

  for (const action of addActions) {
    const handler = clients.get(action.client);
    if (!handler || !action.entry) {
      result.failed++;
      result.errors.push({
        server: action.server,
        client: action.client,
        error: "No handler available for client",
      });
      continue;
    }
    try {
      await handler.addServer(action.server, action.entry);
      result.applied++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        server: action.server,
        client: action.client,
        error: String(err),
      });
    }
  }

  return result;
}

/**
 * getClientConfigs — discover installed clients and read their configs.
 * Skips clients whose config is unreadable (catches errors, logs warning).
 * Returns a map from ClientType -> ClientConfig and ClientType -> ClientHandler.
 */
export async function getClientConfigs(): Promise<{
  configs: Map<ClientType, ClientConfig>;
  handlers: Map<ClientType, ClientHandler>;
}> {
  const configs = new Map<ClientType, ClientConfig>();
  const handlers = new Map<ClientType, ClientHandler>();

  let installedClients: ClientHandler[];
  try {
    installedClients = await getInstalledClients();
  } catch {
    return { configs, handlers };
  }

  await Promise.all(
    installedClients.map(async (handler) => {
      try {
        const config = await handler.readConfig();
        configs.set(handler.type, config);
        handlers.set(handler.type, handler);
      } catch (err) {
        // Unreadable config — skip with warning (caller handles display)
        console.warn(`[mcpman] Warning: could not read config for ${handler.displayName}: ${String(err)}`);
      }
    })
  );

  return { configs, handlers };
}
