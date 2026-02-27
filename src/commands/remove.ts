import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getInstalledClients } from "../clients/client-detector.js";
import type { ClientType } from "../clients/types.js";
import { getInstalledServers } from "../core/server-inventory.js";

const CLIENT_DISPLAY: Record<string, string> = {
  "claude-desktop": "Claude",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

function clientDisplayName(type: string): string {
  return CLIENT_DISPLAY[type] ?? type;
}

export default defineCommand({
  meta: {
    name: "remove",
    description: "Remove an MCP server from one or more AI clients",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to remove",
      required: true,
    },
    client: {
      type: "string",
      description: "Target client (claude, cursor, vscode, windsurf)",
    },
    all: {
      type: "boolean",
      description: "Remove from all clients",
      default: false,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    p.intro(pc.bold("mcpman remove"));

    const serverName = args.server;
    const servers = await getInstalledServers();
    const match = servers.find((s) => s.name === serverName);

    if (!match) {
      p.log.warn(`Server "${serverName}" is not installed.`);
      // Suggest similar names
      const similar = servers.filter(
        (s) => s.name.includes(serverName) || serverName.includes(s.name),
      );
      if (similar.length > 0) {
        p.log.info(`Did you mean: ${similar.map((s) => pc.cyan(s.name)).join(", ")}?`);
      }
      p.outro("Nothing to remove.");
      return;
    }

    // Determine target clients
    let targetClients: ClientType[];

    if (args.all) {
      targetClients = match.clients;
    } else if (args.client) {
      if (!match.clients.includes(args.client as ClientType)) {
        p.log.warn(`Server "${serverName}" is not installed in client "${args.client}".`);
        p.outro("Nothing to remove.");
        return;
      }
      targetClients = [args.client as ClientType];
    } else if (match.clients.length === 1) {
      targetClients = match.clients;
    } else {
      // Multiple clients — let user pick
      const selected = await p.multiselect({
        message: `Remove "${serverName}" from which clients?`,
        options: match.clients.map((c) => ({
          value: c,
          label: clientDisplayName(c),
        })),
        required: true,
      });

      if (p.isCancel(selected)) {
        p.outro("Cancelled.");
        process.exit(0);
      }
      targetClients = selected as ClientType[];
    }

    // Confirm unless --yes
    if (!args.yes) {
      const clientNames = targetClients.map(clientDisplayName).join(", ");
      const confirmed = await p.confirm({
        message: `Remove ${pc.cyan(serverName)} from ${pc.yellow(clientNames)}?`,
      });

      if (p.isCancel(confirmed) || !confirmed) {
        p.outro("Cancelled.");
        return;
      }
    }

    // Perform removal
    const installedClients = await getInstalledClients();
    const errors: string[] = [];

    for (const clientType of targetClients) {
      const handler = installedClients.find((c) => c.type === clientType);
      if (!handler) {
        errors.push(`Client "${clientType}" not found`);
        continue;
      }
      try {
        await handler.removeServer(serverName);
        p.log.success(`Removed from ${clientDisplayName(clientType)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${clientDisplayName(clientType)}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      for (const e of errors) p.log.error(e);
      p.outro(pc.red("Completed with errors."));
      process.exit(1);
    }

    p.outro(pc.green(`Removed "${serverName}" successfully.`));
  },
});
