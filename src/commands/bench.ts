/**
 * bench.ts
 * CLI command: `mcpman bench <server>`
 * Benchmarks MCP server latency via JSON-RPC initialize requests.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { benchServer } from "../core/bench-service.js";
import { readLockfile } from "../core/lockfile.js";

export default defineCommand({
  meta: {
    name: "bench",
    description: "Benchmark MCP server latency (JSON-RPC initialize)",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name as stored in lockfile",
      required: true,
    },
    runs: {
      type: "string",
      description: "Number of benchmark runs (default: 5)",
      default: "5",
    },
    timeout: {
      type: "string",
      description: "Per-run timeout in ms (default: 10000)",
      default: "10000",
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const lockfile = readLockfile();
    const entry = lockfile.servers[args.server];

    if (!entry) {
      console.error(`${pc.red("✗")} Server "${args.server}" not found in lockfile.`);
      console.error(pc.dim("Run `mcpman list` to see installed servers."));
      process.exit(1);
    }

    const runs = Math.max(1, Number.parseInt(args.runs, 10) || 5);
    const timeoutMs = Math.max(1000, Number.parseInt(args.timeout, 10) || 10000);

    if (!args.json) {
      console.log(`\n${pc.cyan("mcpman bench")} — ${pc.bold(args.server)}`);
      console.log(pc.dim(`  Command: ${entry.command} ${(entry.args ?? []).join(" ")}`));
      console.log(pc.dim(`  Runs: ${runs}  Timeout: ${timeoutMs}ms\n`));
      process.stdout.write(pc.dim("  Running"));
    }

    // Build env from lockfile envVars (KEY=VALUE format)
    const env: Record<string, string> = {};
    for (const ev of entry.envVars ?? []) {
      const idx = ev.indexOf("=");
      if (idx > 0) env[ev.slice(0, idx)] = ev.slice(idx + 1);
    }

    const result = await benchServer(entry.command, entry.args ?? [], env, runs, timeoutMs);

    if (!args.json) process.stdout.write("\n");

    if (result.error) {
      if (args.json) {
        console.log(JSON.stringify({ server: args.server, error: result.error }));
      } else {
        console.error(`\n${pc.red("✗")} Benchmark failed: ${result.error}`);
      }
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify({ server: args.server, ...result }, null, 2));
      if (result.p95 > timeoutMs) process.exit(1);
      return;
    }

    // Human-readable table
    const pad = (s: string, w: number) => s.padEnd(w);
    const ms = (n: number) => `${n}ms`;

    console.log(`\n  ${pc.bold("Latency statistics")} for ${pc.cyan(args.server)}`);
    console.log(pc.dim("  ─────────────────────────────"));
    console.log(`  ${pad("min", 8)} ${pc.green(ms(result.min))}`);
    console.log(`  ${pad("avg", 8)} ${ms(result.avg)}`);
    console.log(`  ${pad("p50", 8)} ${ms(result.p50)}`);
    console.log(
      `  ${pad("p95", 8)} ${result.p95 > timeoutMs ? pc.red(ms(result.p95)) : pc.yellow(ms(result.p95))}`,
    );
    console.log(`  ${pad("max", 8)} ${ms(result.max)}`);
    console.log(`  ${pad("runs", 8)} ${result.runs}`);
    console.log("");

    if (result.p95 > timeoutMs) {
      console.error(pc.red(`  ✗ p95 (${result.p95}ms) exceeds timeout (${timeoutMs}ms)`));
      process.exit(1);
    }

    console.log(pc.green("  ✓ Benchmark complete"));
  },
});
