/**
 * health.ts
 * `mcpman health` — real-time health monitoring dashboard for installed MCP servers.
 *
 * Pings all servers (or a single named server), reports status (healthy/degraded/down),
 * response times, and a per-check breakdown.  Uses nanospinner for progress feedback
 * and picocolors for colour-coded status indicators.
 */

import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { checkServerHealth } from "../core/health-checker.js";
import type { HealthResult, HealthStatus } from "../core/health-checker.js";
import { getInstalledServers } from "../core/server-inventory.js";
import { pad } from "./shared-helpers.js";

// ── Formatting helpers ────────────────────────────────────────────────────────

function statusIcon(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return pc.green("● healthy");
    case "unhealthy":
      return pc.red("● down");
    default:
      return pc.yellow("● unknown");
  }
}

function checkIcon(passed: boolean, skipped: boolean): string {
  if (skipped) return pc.dim("-");
  return passed ? pc.green("✓") : pc.red("✗");
}

function printDashboard(results: HealthResult[]): void {
  const nameW = Math.max(6, ...results.map((r) => r.serverName.length));

  // Summary header row
  const header = `  ${pad("SERVER", nameW)}  STATUS`;
  console.log(pc.bold("\n  mcpman health\n"));
  console.log(pc.dim(header));
  console.log(pc.dim(`  ${"─".repeat(nameW + 20)}`));

  for (const result of results) {
    const name = pad(result.serverName, nameW);
    console.log(`  ${name}  ${statusIcon(result.status)}`);

    for (const check of result.checks) {
      const icon = checkIcon(check.passed, check.skipped ?? false);
      const msg = check.skipped ? pc.dim(check.message) : check.message;
      console.log(`    ${icon}  ${pc.dim(check.name)}: ${msg}`);
    }
    console.log();
  }
}

function printSummaryLine(results: HealthResult[]): void {
  const healthy = results.filter((r) => r.status === "healthy").length;
  const unhealthy = results.filter((r) => r.status === "unhealthy").length;
  const unknown = results.filter((r) => r.status === "unknown").length;

  const parts: string[] = [];
  if (healthy > 0) parts.push(pc.green(`${healthy} healthy`));
  if (unhealthy > 0) parts.push(pc.red(`${unhealthy} down`));
  if (unknown > 0) parts.push(pc.yellow(`${unknown} unknown`));

  console.log(`  ${parts.join("  ·  ")}\n`);
}

// ── Concurrency runner ────────────────────────────────────────────────────────

async function runParallel<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().then((r) => {
      results.push(r);
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ── Command ───────────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "health",
    description: "Real-time health monitoring dashboard for installed MCP servers",
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
    concurrency: {
      type: "string",
      description: "Max parallel health checks (default: 5)",
      default: "5",
    },
  },
  async run({ args }) {
    const label = args.server ? `Checking ${args.server}...` : "Checking all servers...";
    const spinner = createSpinner(label).start();

    // Fetch installed servers from client configs
    let servers = await getInstalledServers();

    if (args.server) {
      servers = servers.filter((s) => s.name === args.server);
      if (servers.length === 0) {
        spinner.error({ text: `Server "${args.server}" not found in any client config.` });
        process.exit(1);
      }
    }

    if (servers.length === 0) {
      spinner.warn({ text: "No MCP servers installed." });
      console.log(pc.dim("\n  Run mcpman install <server> to get started.\n"));
      return;
    }

    const concurrency = Math.max(1, Number.parseInt(args.concurrency ?? "5", 10) || 5);
    const tasks = servers.map((s) => () => checkServerHealth(s.name, s.config));

    let results: HealthResult[];
    try {
      results = await runParallel(tasks, concurrency);
    } catch (err) {
      spinner.error({ text: "Health check failed" });
      console.error(pc.red(String(err)));
      process.exit(1);
    }

    // Sort: unhealthy first so issues are immediately visible
    results.sort((a, b) => {
      const order: Record<HealthStatus, number> = { unhealthy: 0, unknown: 1, healthy: 2 };
      return order[a.status] - order[b.status];
    });

    const unhealthyCount = results.filter((r) => r.status === "unhealthy").length;
    spinner.success({ text: `Checked ${results.length} server(s)` });

    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    printDashboard(results);
    printSummaryLine(results);

    if (unhealthyCount > 0) {
      console.log(
        pc.dim(`  Run ${pc.cyan("mcpman doctor --fix")} for detailed fix suggestions.\n`),
      );
      process.exit(1);
    }
  },
});
