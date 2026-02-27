import { defineCommand } from "citty";
import pc from "picocolors";
import { json } from "../utils/logger.js";
import { getInstalledServers } from "../core/server-inventory.js";
import { quickHealthProbe } from "../core/health-checker.js";

const STATUS_ICON = {
  healthy: pc.green("●"),
  unhealthy: pc.red("●"),
  unknown: pc.dim("○"),
};

export default defineCommand({
  meta: {
    name: "list",
    description: "List installed MCP servers",
  },
  args: {
    client: {
      type: "string",
      description: "Filter by client (claude, cursor, vscode, windsurf)",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const servers = await getInstalledServers(args.client);

    if (servers.length === 0) {
      const filter = args.client ? ` for client "${args.client}"` : "";
      console.log(pc.dim(`No MCP servers installed${filter}. Run ${pc.cyan("mcpman install <server>")} to get started.`));
      return;
    }

    // Run health probes in parallel (timeout 3s each)
    const withStatus = await Promise.all(
      servers.map(async (s) => ({
        ...s,
        status: await quickHealthProbe(s.config, 3000),
      }))
    );

    if (args.json) {
      json({
        servers: withStatus.map((s) => ({
          name: s.name,
          clients: s.clients,
          status: s.status,
          config: s.config,
        })),
        total: withStatus.length,
      });
      return;
    }

    // Calculate column widths for aligned output
    const nameWidth = Math.max(4, ...withStatus.map((s) => s.name.length));
    const clientsWidth = Math.max(7, ...withStatus.map((s) => formatClients(s.clients).length));

    // Header
    const header = `  ${pad("NAME", nameWidth)}  ${pad("CLIENT(S)", clientsWidth)}  ${pad("COMMAND", 20)}  STATUS`;
    console.log(pc.dim(header));
    console.log(pc.dim(`  ${"-".repeat(nameWidth)}  ${"-".repeat(clientsWidth)}  ${"-".repeat(20)}  ------`));

    for (const s of withStatus) {
      const icon = STATUS_ICON[s.status];
      const clientsStr = formatClients(s.clients);
      const cmdStr = truncate(`${s.config.command}${s.config.args ? " " + s.config.args.join(" ") : ""}`, 20);
      console.log(`  ${pad(s.name, nameWidth)}  ${pad(clientsStr, clientsWidth)}  ${pad(cmdStr, 20)}  ${icon} ${s.status}`);
    }

    const clientSet = new Set(withStatus.flatMap((s) => s.clients));
    console.log(pc.dim(`\n  ${withStatus.length} server${withStatus.length !== 1 ? "s" : ""} · ${clientSet.size} client${clientSet.size !== 1 ? "s" : ""}`));
  },
});

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const CLIENT_DISPLAY: Record<string, string> = {
  "claude-desktop": "Claude",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

function formatClients(clients: string[]): string {
  return clients.map((c) => CLIENT_DISPLAY[c] ?? c).join(", ");
}
