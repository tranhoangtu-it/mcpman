/**
 * outdated.ts
 * `mcpman outdated` — check all installed MCP servers for newer versions on npm registry.
 *
 * Reads the lockfile for current versions, queries npm/smithery/github for latest,
 * then renders a colour-coded table: package | current | latest | status.
 */

import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import { type UpdateInfo, checkAllVersions } from "../core/version-checker.js";
import { pad } from "./shared-helpers.js";

// ── Table rendering ───────────────────────────────────────────────────────────

function statusLabel(info: UpdateInfo): string {
  if (!info.hasUpdate) return pc.green("up-to-date");
  switch (info.updateType) {
    case "major":
      return pc.red("major");
    case "minor":
      return pc.yellow("minor");
    case "patch":
      return pc.cyan("patch");
    default:
      return pc.yellow("outdated");
  }
}

function printTable(results: UpdateInfo[]): void {
  if (results.length === 0) {
    console.log(pc.dim("\n  No servers to check.\n"));
    return;
  }

  const nameW = Math.max(7, ...results.map((r) => r.server.length));
  const curW = Math.max(7, ...results.map((r) => r.currentVersion.length));
  const latW = Math.max(6, ...results.map((r) => r.latestVersion.length));

  const header = [pad("PACKAGE", nameW), pad("CURRENT", curW), pad("LATEST", latW), "STATUS"].join(
    "  ",
  );

  console.log(pc.bold(`\n  ${header}`));
  console.log(pc.dim(`  ${"─".repeat(nameW + curW + latW + 20)}`));

  for (const r of results) {
    const name = pad(r.server, nameW);
    const cur = pad(r.currentVersion, curW);
    const lat = pad(r.latestVersion, latW);
    const status = statusLabel(r);
    console.log(`  ${name}  ${cur}  ${lat}  ${status}`);
  }
  console.log();
}

// ── Command ───────────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "outdated",
    description: "Check installed MCP servers for newer versions available on the registry",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
    outdated: {
      type: "boolean",
      description: "Show only packages that have updates available",
      default: false,
    },
  },
  async run({ args }) {
    const lockfile = readLockfile();
    const entries = Object.entries(lockfile.servers);

    if (entries.length === 0) {
      console.log(pc.dim("\n  No MCP servers installed. Run mcpman install <server> first.\n"));
      return;
    }

    const spinner = createSpinner(`Checking ${entries.length} server(s) for updates...`).start();

    let results: UpdateInfo[];
    try {
      results = await checkAllVersions(lockfile);
    } catch (err) {
      spinner.error({ text: "Version check failed" });
      console.error(pc.red(String(err)));
      process.exit(1);
    }

    const outdatedCount = results.filter((r) => r.hasUpdate).length;
    spinner.success({ text: `Checked ${results.length} server(s)` });

    // Filter to outdated-only if requested
    const display = args.outdated ? results.filter((r) => r.hasUpdate) : results;

    if (args.json) {
      console.log(JSON.stringify(display, null, 2));
      return;
    }

    printTable(display);

    if (outdatedCount === 0) {
      console.log(pc.green("  All servers are up to date."));
    } else {
      console.log(
        pc.yellow(`  ${outdatedCount} server(s) have updates available.`) +
          pc.dim(" Run mcpman update to apply."),
      );
    }
    console.log();
  },
});
