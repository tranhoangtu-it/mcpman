import { getInstalledClients } from "../clients/client-detector.js";
import type { ClientType, ServerEntry } from "../clients/types.js";
import type { HealthStatus } from "./health-checker.js";

export interface InstalledServer {
  name: string;
  clients: ClientType[];
  config: ServerEntry;
  status: HealthStatus;
}

/**
 * Aggregate all installed MCP servers across all detected clients.
 * Servers present in multiple clients are merged into one entry with all client types listed.
 */
export async function getInstalledServers(clientFilter?: string): Promise<InstalledServer[]> {
  const clients = await getInstalledClients();
  const filtered = clientFilter ? clients.filter((c) => c.type === clientFilter) : clients;

  const serverMap = new Map<string, InstalledServer>();

  for (const client of filtered) {
    let config: Record<string, ServerEntry> | undefined;
    try {
      config = await client.readConfig();
    } catch {
      continue; // skip clients with unreadable config
    }

    for (const [name, entry] of Object.entries(config.servers)) {
      const existing = serverMap.get(name);
      if (existing) {
        if (!existing.clients.includes(client.type)) {
          existing.clients.push(client.type);
        }
      } else {
        serverMap.set(name, {
          name,
          clients: [client.type],
          config: entry,
          status: "unknown",
        });
      }
    }
  }

  return Array.from(serverMap.values());
}
