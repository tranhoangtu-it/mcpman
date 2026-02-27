import { defineCommand } from "citty";
import pc from "picocolors";
import type { CheckResult } from "../core/diagnostics.js";
import { checkServerHealth } from "../core/health-checker.js";
import type { HealthResult } from "../core/health-checker.js";
import { checkPluginHealth } from "../core/plugin-health-checker.js";
import type { PluginHealthSummary } from "../core/plugin-health-checker.js";
import { getInstalledServers } from "../core/server-inventory.js";

const CHECK_ICON = {
  pass: pc.green("✓"),
  fail: pc.red("✗"),
  skip: pc.dim("-"),
  warn: pc.yellow("⚠"),
};

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Check MCP server health and configuration",
  },
  args: {
    fix: {
      type: "boolean",
      description: "Show fix suggestions for detected issues",
      default: false,
    },
  },
  async run({ args }) {
    console.log(pc.bold("\n  mcpman doctor\n"));

    const servers = await getInstalledServers();

    if (servers.length === 0) {
      console.log(
        pc.dim("  No MCP servers installed. Run mcpman install <server> to get started."),
      );
      return;
    }

    // Run health checks with concurrency limit of 5
    const tasks = servers.map((s) => () => checkServerHealth(s.name, s.config));
    const results = await runParallel(tasks, 5);

    let passed = 0;
    let failed = 0;

    for (const result of results) {
      printServerResult(result, args.fix);
      if (result.status === "healthy") passed++;
      else failed++;
    }

    // Plugin health checks
    const pluginSummary = checkPluginHealth();
    if (pluginSummary.total > 0) {
      printPluginSection(pluginSummary);
    }

    // Summary
    console.log(pc.dim(`  ${"─".repeat(50)}`));
    const parts: string[] = [];
    if (passed > 0) parts.push(pc.green(`${passed} healthy`));
    if (failed > 0) parts.push(pc.red(`${failed} unhealthy`));
    console.log(`  Summary: ${parts.join(", ")}`);

    if (pluginSummary.total > 0) {
      const pParts: string[] = [];
      if (pluginSummary.healthy > 0) pParts.push(pc.green(`${pluginSummary.healthy} ok`));
      if (pluginSummary.unhealthy > 0) pParts.push(pc.red(`${pluginSummary.unhealthy} broken`));
      console.log(`  Plugins: ${pParts.join(", ")}`);
    }

    if (failed > 0 || pluginSummary.unhealthy > 0) {
      if (!args.fix) {
        console.log(pc.dim(`  Run ${pc.cyan("mcpman doctor --fix")} for fix suggestions.\n`));
      }
      process.exit(1);
    }

    console.log();
  },
});

function printPluginSection(summary: PluginHealthSummary): void {
  console.log(pc.bold(`  Plugins (${summary.total})`));
  for (const r of summary.results) {
    const icon = r.loadable && r.prefixUnique && r.resolvable ? pc.green("✓") : pc.red("✗");
    const label = r.pluginName ? `${r.packageName} (${r.pluginName})` : r.packageName;
    const prefix = r.prefix ? pc.dim(` [${r.prefix}]`) : "";
    console.log(`    ${icon} ${label}${prefix}`);
    if (r.error) {
      console.log(`      ${pc.yellow("→")} ${r.error}`);
    }
  }
  console.log();
}

function printServerResult(result: HealthResult, showFix: boolean): void {
  const icon = result.status === "healthy" ? pc.green("●") : pc.red("●");
  console.log(`  ${icon} ${pc.bold(result.serverName)}`);

  for (const check of result.checks) {
    const checkIcon = check.skipped
      ? CHECK_ICON.skip
      : check.passed
        ? CHECK_ICON.pass
        : CHECK_ICON.fail;

    console.log(`    ${checkIcon} ${check.name}: ${check.message}`);

    if (showFix && !check.passed && !check.skipped && check.fix) {
      console.log(`      ${pc.yellow("→")} Fix: ${pc.cyan(check.fix)}`);
    }
  }

  console.log();
}

async function runParallel<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
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
