/**
 * status.ts
 * `mcpman status` — live process snapshot for installed MCP servers.
 */

import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { getServerStatuses } from "../core/status-checker.js";
import type { ServerStatus } from "../core/status-checker.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function formatStatus(s: ServerStatus): string {
  return s.alive ? pc.green("alive") : pc.red("dead");
}

function formatResponseTime(s: ServerStatus): string {
  if (!s.alive || s.responseTimeMs === null) return pc.dim("—");
  return pc.cyan(`${s.responseTimeMs}ms`);
}

function printTable(statuses: ServerStatus[]): void {
  const nameW = Math.max(6, ...statuses.map((s) => s.name.length));
  const header = `  ${pad("SERVER", nameW)}  ${pad("STATUS", 7)}  ${pad("RESPONSE", 10)}  ERROR`;
  console.log(pc.dim(header));
  console.log(
    pc.dim(`  ${"─".repeat(nameW)}  ${"─".repeat(7)}  ${"─".repeat(10)}  ${"─".repeat(20)}`),
  );

  for (const s of statuses) {
    const errStr = s.error ? pc.dim(s.error) : "";
    console.log(
      `  ${pad(s.name, nameW)}  ${pad(formatStatus(s), 7 + 10 /* color codes */)}  ${pad(formatResponseTime(s), 10 + 10)}  ${errStr}`,
    );
  }
}

// ── Command ────────────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "status",
    description: "Show live process status for installed MCP servers",
  },
  args: {
    server: {
      type: "string",
      description: "Check a specific server by name",
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const label = args.server ? `Probing ${args.server}...` : "Probing all servers...";
    const spinner = createSpinner(label).start();

    let statuses: ServerStatus[];
    try {
      statuses = await getServerStatuses(args.server);
    } catch (err) {
      spinner.error({ text: "Status check failed" });
      console.error(pc.red(String(err)));
      process.exit(1);
    }

    spinner.success({ text: `Checked ${statuses.length} server(s)` });

    if (statuses.length === 0) {
      console.log(pc.dim("\n  No MCP servers installed.\n"));
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }

    console.log(pc.bold("\n  mcpman status\n"));
    printTable(statuses);

    const alive = statuses.filter((s) => s.alive).length;
    const dead = statuses.length - alive;
    const parts: string[] = [];
    if (alive > 0) parts.push(pc.green(`${alive} alive`));
    if (dead > 0) parts.push(pc.red(`${dead} dead`));
    console.log(`\n  ${parts.join("  ·  ")}\n`);
  },
});
