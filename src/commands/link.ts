/**
 * link.ts
 * Register a local MCP server directory with AI clients.
 * Like `npm link` but for MCP servers — no publish/install cycle needed during dev.
 * Resolves absolute path, detects runtime, adds to client configs + lockfile.
 */

import path from "node:path";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getInstalledClients } from "../clients/client-detector.js";
import type { ClientType } from "../clients/types.js";
import { detectLocalServer, registerLinkedServer } from "../core/link-service.js";

export default defineCommand({
  meta: {
    name: "link",
    description: "Register a local MCP server directory with AI clients",
  },
  args: {
    dir: {
      type: "positional",
      description: "Path to local MCP server directory (default: .)",
      required: false,
    },
    client: {
      type: "string",
      description: "Register with specific client only (claude-desktop, cursor, vscode, windsurf)",
      alias: "c",
    },
    name: {
      type: "string",
      description: "Override the detected server name",
      alias: "n",
    },
  },
  async run({ args }) {
    const dirArg = (args.dir as string | undefined) ?? ".";
    const clientFilter = args.client as string | undefined;
    const nameOverride = args.name as string | undefined;

    // Resolve to absolute path
    const absoluteDir = path.resolve(dirArg);

    // Detect server metadata
    let linkResult: Awaited<ReturnType<typeof detectLocalServer>>;
    try {
      linkResult = detectLocalServer(absoluteDir);
    } catch (err) {
      console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const serverName = nameOverride ?? linkResult.name;

    console.log(pc.dim(`\n  Detected: ${pc.cyan(serverName)} (${linkResult.runtime})`));
    console.log(pc.dim(`  Path: ${absoluteDir}`));
    console.log(pc.dim(`  Command: ${linkResult.command} ${linkResult.args.join(" ")}`));

    // Load clients, optionally filtered
    const allClients = await getInstalledClients();
    const clients = clientFilter
      ? allClients.filter((c) => c.type === (clientFilter as ClientType))
      : allClients;

    if (clientFilter && clients.length === 0) {
      console.error(pc.red(`  Error: Unknown client '${clientFilter}'.`));
      process.exit(1);
    }

    // Register server
    let registered: string[];
    try {
      registered = await registerLinkedServer(linkResult, clients, undefined, nameOverride);
    } catch (err) {
      console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    if (registered.length === 0) {
      console.log(pc.yellow("  Warning: No clients registered. Are any AI clients installed?"));
      console.log(pc.dim(`  Server saved to lockfile with source "local".`));
    } else {
      console.log(pc.green(`\n  Linked ${pc.bold(serverName)} to: ${registered.join(", ")}\n`));
      console.log(pc.dim(`  Run ${pc.cyan("mcpman list")} to verify.`));
      console.log(
        pc.dim(`  Run ${pc.cyan(`mcpman watch ${serverName}`)} to start with auto-restart.`),
      );
    }
    console.log();
  },
});
