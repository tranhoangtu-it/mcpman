import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { getPackageInfo } from "../core/package-info.js";
import type { PackageInfo } from "../core/package-info.js";

// Color-code trust score + risk level
function colorRisk(score: number | null, riskLevel: string): string {
  const label = score !== null ? `${score}/100 (${riskLevel})` : riskLevel;
  if (riskLevel === "LOW") return pc.green(label);
  if (riskLevel === "MEDIUM") return pc.yellow(label);
  if (riskLevel === "HIGH") return pc.red(label);
  if (riskLevel === "CRITICAL") return pc.bold(pc.red(label));
  return pc.dim(label); // UNKNOWN
}

// Format days as human-readable relative time
function formatDaysAgo(isoDate: string): string {
  if (!isoDate) return "unknown";
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Print formatted info panel for a package
function printInfo(info: PackageInfo): void {
  const installedBadge = info.isInstalled ? pc.green(" [installed]") : pc.dim(" [not installed]");
  console.log();
  console.log(pc.bold(`  ${info.name}@${info.version}`) + installedBadge);
  console.log(pc.dim("  " + "─".repeat(60)));

  // Basic fields
  console.log(`  ${pc.dim("Source:")}   ${info.source}`);
  console.log(`  ${pc.dim("Runtime:")}  ${info.runtime}`);

  if (info.description) {
    console.log(`  ${pc.dim("Description:")} ${info.description}`);
  }

  if (info.deprecated) {
    console.log(`  ${pc.red("[DEPRECATED]")} This package is deprecated`);
  }

  console.log();

  // Trust score section
  console.log(`  ${pc.bold("Trust & Security")}`);
  console.log(`  ${pc.dim("Trust score:")}   ${colorRisk(info.trustScore, info.riskLevel)}`);

  if (info.source === "npm") {
    console.log(
      `  ${pc.dim("Downloads:")}    ${info.weeklyDownloads.toLocaleString()}/week  ` +
        `${pc.dim("|")}  ${pc.dim("Age:")} ${info.packageAge}d  ` +
        `${pc.dim("|")}  ${pc.dim("Maintainers:")} ${info.maintainerCount}`,
    );
    if (info.lastPublish) {
      console.log(`  ${pc.dim("Last publish:")} ${formatDaysAgo(info.lastPublish)}`);
    }
  } else {
    console.log(pc.dim("  (Trust data available for npm packages only)"));
  }

  console.log();

  // Env vars
  console.log(`  ${pc.bold("Environment Variables")}`);
  if (info.envVars.length > 0) {
    for (const env of info.envVars) {
      console.log(`    ${pc.cyan("•")} ${env}`);
    }
  } else {
    console.log(pc.dim("    none required"));
  }

  console.log();

  // Installed clients
  console.log(`  ${pc.bold("Installed Clients")}`);
  if (info.installedClients.length > 0) {
    for (const client of info.installedClients) {
      console.log(`    ${pc.green("✓")} ${client}`);
    }
  } else {
    console.log(pc.dim("    Not installed in any client"));
  }

  console.log();
  console.log(pc.dim("  " + "─".repeat(60)));
  console.log();
}

export default defineCommand({
  meta: {
    name: "info",
    description: "Show detailed metadata for an MCP server (installed or from registry)",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name (e.g. @modelcontextprotocol/server-filesystem)",
      required: true,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const spinner = createSpinner(`Fetching info for ${args.server}...`).start();

    let info;
    try {
      info = await getPackageInfo(args.server);
    } catch (err) {
      spinner.error({ text: "Failed to fetch package info" });
      console.error(pc.red(String(err)));
      process.exit(1);
    }

    if (!info) {
      spinner.error({ text: `Package not found: ${args.server}` });
      console.log(
        pc.dim(`\n  "${args.server}" was not found in the npm registry or your lockfile.\n`),
      );
      process.exit(1);
    }

    spinner.success({ text: `Found ${args.server}` });

    if (args.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    printInfo(info);
  },
});
