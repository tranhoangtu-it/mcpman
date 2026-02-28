/**
 * why.ts
 * Show why a server is installed — source, clients, profiles, env vars.
 * Like `npm why` or `brew uses`. All data from local files, no network calls.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { formatWhyOutput, getServerProvenance } from "../core/why-service.js";

export default defineCommand({
  meta: {
    name: "why",
    description: "Show why a server is installed (provenance, clients, profiles)",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to inspect",
      required: true,
    },
    json: {
      type: "boolean",
      description: "Output as JSON for scripting",
      default: false,
    },
  },
  async run({ args }) {
    const serverName = args.server as string;
    const asJson = args.json as boolean;

    const result = await getServerProvenance(serverName);

    if (!result) {
      console.error(pc.red(`  Server '${serverName}' not found in lockfile or any client config.`));
      console.error(pc.dim(`  Run ${pc.cyan("mcpman list")} to see installed servers.`));
      process.exit(1);
    }

    if (result.orphaned) {
      console.log(pc.yellow(`\n  Server '${serverName}' is orphaned:`));
      console.log(pc.dim("  Found in client config(s) but not in lockfile."));
      console.log(pc.dim(`  Run ${pc.cyan("mcpman sync --remove")} to clean up.\n`));
      const registeredClients = result.clients.filter((c) => c.registered).map((c) => c.type);
      if (registeredClients.length > 0) {
        console.log(`  Registered in: ${registeredClients.join(", ")}`);
      }
      return;
    }

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log();
    console.log(formatWhyOutput(result));
    console.log();
  },
});
