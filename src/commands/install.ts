import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import { installServer } from "../core/installer.js";
import { findLockfile, readLockfile, resolveLockfilePath } from "../core/lockfile.js";
import { error, info } from "../utils/logger.js";

export default defineCommand({
  meta: {
    name: "install",
    description: "Install an MCP server into one or more AI clients",
  },
  args: {
    server: {
      type: "positional",
      description:
        "Server name or package (e.g. @modelcontextprotocol/server-github, smithery:github)",
      required: false,
    },
    client: {
      type: "string",
      description: "Target client (claude-desktop, cursor, vscode, windsurf)",
    },
    env: {
      type: "string",
      description: "Environment variable KEY=VAL (can repeat)",
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    // No server arg: restore all from lockfile
    if (!args.server) {
      await restoreFromLockfile();
      return;
    }

    await installServer(args.server, {
      client: args.client,
      env: args.env,
      yes: args.yes,
    });
  },
});

// Restore all servers from lockfile (mcpman install, no args)
async function restoreFromLockfile(): Promise<void> {
  const lockPath = findLockfile();
  if (!lockPath) {
    error("No mcpman.lock found. Run 'mcpman init' first or provide a server name.");
    process.exit(1);
  }

  const lockfile = readLockfile(lockPath);
  const entries = Object.entries(lockfile.servers);
  if (entries.length === 0) {
    info("Lockfile is empty — nothing to restore.");
    return;
  }

  p.intro(`mcpman install (restore from ${lockPath})`);
  p.log.info(`Restoring ${entries.length} server(s)...`);

  for (const [name, entry] of entries) {
    // Reconstruct install input from lockfile data
    const input =
      entry.source === "smithery"
        ? `smithery:${name}`
        : entry.source === "github"
          ? entry.resolved
          : name;

    // Install with pinned version (args already have exact version)
    await installServer(input, {
      client: entry.clients[0],
      yes: true,
    });
  }

  p.outro("Restore complete.");
}
