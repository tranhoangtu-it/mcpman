/**
 * diff.ts
 * CLI command: `mcpman diff <clientA> <clientB>`
 * Shows visual diff of MCP server configs between two AI clients.
 * Green = added in B, Red = removed from A, Yellow = changed.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import type { ClientType } from "../clients/types.js";
import { diffClientConfigs, loadClientConfig } from "../core/config-differ.js";

const VALID_CLIENTS: ClientType[] = ["claude-desktop", "cursor", "vscode", "windsurf"];

const CLIENT_DISPLAY: Record<ClientType, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

export default defineCommand({
  meta: {
    name: "diff",
    description: "Show config diff between two AI clients",
  },
  args: {
    clientA: {
      type: "positional",
      description: `Source client (${VALID_CLIENTS.join("|")})`,
      required: true,
    },
    clientB: {
      type: "positional",
      description: `Target client (${VALID_CLIENTS.join("|")})`,
      required: true,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const clientA = args.clientA as ClientType;
    const clientB = args.clientB as ClientType;

    if (!VALID_CLIENTS.includes(clientA)) {
      console.error(
        `${pc.red("✗")} Unknown client "${clientA}". Valid: ${VALID_CLIENTS.join(", ")}`,
      );
      process.exit(1);
    }
    if (!VALID_CLIENTS.includes(clientB)) {
      console.error(
        `${pc.red("✗")} Unknown client "${clientB}". Valid: ${VALID_CLIENTS.join(", ")}`,
      );
      process.exit(1);
    }
    if (clientA === clientB) {
      console.error(`${pc.red("✗")} clientA and clientB must be different.`);
      process.exit(1);
    }

    const [configA, configB] = await Promise.all([
      loadClientConfig(clientA),
      loadClientConfig(clientB),
    ]);

    if (!configA) {
      console.error(`${pc.red("✗")} Could not read config for ${CLIENT_DISPLAY[clientA]}.`);
      process.exit(1);
    }
    if (!configB) {
      console.error(`${pc.red("✗")} Could not read config for ${CLIENT_DISPLAY[clientB]}.`);
      process.exit(1);
    }

    const diffs = diffClientConfigs(configA, configB);

    if (args.json) {
      console.log(JSON.stringify({ clientA, clientB, diffs }, null, 2));
      return;
    }

    const labelA = CLIENT_DISPLAY[clientA];
    const labelB = CLIENT_DISPLAY[clientB];

    console.log(`\n${pc.bold("mcpman diff")}  ${pc.cyan(labelA)} → ${pc.cyan(labelB)}\n`);

    if (diffs.length === 0) {
      console.log(pc.green("  ✓ No differences — configs are identical."));
      console.log("");
      return;
    }

    for (const d of diffs) {
      if (d.change === "added") {
        console.log(`  ${pc.green("+")} ${pc.bold(d.server)}  ${pc.dim(`(only in ${labelB})`)}`);
      } else if (d.change === "removed") {
        console.log(`  ${pc.red("-")} ${pc.bold(d.server)}  ${pc.dim(`(only in ${labelA})`)}`);
      } else {
        console.log(`  ${pc.yellow("~")} ${pc.bold(d.server)}  ${pc.dim("(changed)")}`);
        for (const detail of d.details ?? []) {
          console.log(`      ${pc.dim(detail)}`);
        }
      }
    }

    const added = diffs.filter((d) => d.change === "added").length;
    const removed = diffs.filter((d) => d.change === "removed").length;
    const changed = diffs.filter((d) => d.change === "changed").length;

    const parts: string[] = [];
    if (added > 0) parts.push(pc.green(`+${added} added`));
    if (removed > 0) parts.push(pc.red(`-${removed} removed`));
    if (changed > 0) parts.push(pc.yellow(`~${changed} changed`));

    console.log(`\n  ${parts.join("  ")}\n`);
  },
});
