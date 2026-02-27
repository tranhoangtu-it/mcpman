import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import type { ClientHandler } from "../clients/types.js";
import { readLockfile } from "../core/lockfile.js";
import { scanAllServers, scanServer } from "../core/security-scanner.js";
import type { SecurityReport } from "../core/security-scanner.js";
import { applyServerUpdate } from "../core/server-updater.js";
import type { RiskLevel } from "../core/trust-scorer.js";
import { checkVersion } from "../core/version-checker.js";

// Color-code risk level text
function colorRisk(level: RiskLevel | "UNKNOWN", score: number | null): string {
  const label = score !== null ? `${score}/100 (${level})` : level;
  if (level === "LOW") return pc.green(label);
  if (level === "MEDIUM") return pc.yellow(label);
  if (level === "HIGH") return pc.red(label);
  if (level === "CRITICAL") return pc.bold(pc.red(label));
  return pc.dim(label); // UNKNOWN
}

// Format a relative time string from ISO date
function daysAgo(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Count vulnerabilities by severity
function countVulns(vulns: SecurityReport["vulnerabilities"]): string {
  const c = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const v of vulns) c[v.severity]++;
  if (vulns.length === 0) return pc.green("none");
  const parts: string[] = [];
  if (c.critical) parts.push(pc.bold(pc.red(`${c.critical} critical`)));
  if (c.high) parts.push(pc.red(`${c.high} high`));
  if (c.moderate) parts.push(pc.yellow(`${c.moderate} moderate`));
  if (c.low) parts.push(pc.dim(`${c.low} low`));
  return parts.join(", ");
}

// Print a single security report
function printReport(report: SecurityReport): void {
  const riskColored = colorRisk(report.riskLevel, report.score);
  const icon =
    report.riskLevel === "LOW"
      ? pc.green("●")
      : report.riskLevel === "MEDIUM"
        ? pc.yellow("●")
        : report.riskLevel === "UNKNOWN"
          ? pc.dim("○")
          : pc.red("●");

  console.log(`  ${icon} ${pc.bold(report.server)}  Score: ${riskColored}`);

  if (report.source !== "npm") {
    console.log(`    ${pc.dim("Non-npm source — security data unavailable")}`);
    console.log();
    return;
  }

  if (report.metadata) {
    const { weeklyDownloads, packageAge, lastPublish, maintainerCount, deprecated } =
      report.metadata;
    const dlStr = weeklyDownloads.toLocaleString();
    console.log(
      `    ${pc.dim("Downloads:")} ${dlStr}/week  ${pc.dim("|")}  ` +
        `${pc.dim("Age:")} ${packageAge}d  ${pc.dim("|")}  ` +
        `${pc.dim("Last publish:")} ${daysAgo(lastPublish)}  ${pc.dim("|")}  ` +
        `${pc.dim("Maintainers:")} ${maintainerCount}` +
        (deprecated ? pc.red("  [DEPRECATED]") : ""),
    );
  }

  console.log(`    ${pc.dim("Vulnerabilities:")} ${countVulns(report.vulnerabilities)}`);

  if (report.vulnerabilities.length > 0) {
    for (const v of report.vulnerabilities) {
      const sevColor = v.severity === "critical" || v.severity === "high" ? pc.red : pc.yellow;
      const url = v.url ? pc.dim(` ${v.url}`) : "";
      console.log(`      ${sevColor("▸")} [${v.severity}] ${v.title}${url}`);
    }
  }

  console.log();
}

export default defineCommand({
  meta: {
    name: "audit",
    description: "Scan installed MCP servers for security vulnerabilities and trust scores",
  },
  args: {
    server: {
      type: "positional",
      description: "Specific server to audit (omit to audit all)",
      required: false,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
    fix: {
      type: "boolean",
      description: "Apply updates to fix vulnerable packages",
      default: false,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt (use with --fix)",
      default: false,
    },
  },
  async run({ args }) {
    const lockfile = readLockfile();
    const { servers } = lockfile;

    if (Object.keys(servers).length === 0) {
      console.log(
        pc.dim("\n  No MCP servers installed. Run mcpman install <server> to get started.\n"),
      );
      return;
    }

    // Filter to specific server if provided
    const targets: typeof servers = {};
    if (args.server) {
      if (!servers[args.server]) {
        console.error(pc.red(`\n  Server "${args.server}" not found in lockfile.\n`));
        process.exit(1);
      }
      targets[args.server] = servers[args.server];
    } else {
      Object.assign(targets, servers);
    }

    const spinner = createSpinner(`Scanning ${Object.keys(targets).length} server(s)...`).start();

    let reports: SecurityReport[];
    try {
      reports = args.server
        ? [await scanServer(args.server, targets[args.server])]
        : await scanAllServers(targets);
    } catch (err) {
      spinner.error({ text: "Scan failed" });
      console.error(pc.red(String(err)));
      process.exit(1);
    }

    spinner.success({ text: `Scanned ${reports.length} server(s)` });

    if (args.json) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }

    console.log(pc.bold("\n  mcpman audit\n"));
    console.log(pc.dim("  " + "─".repeat(60)));

    for (const report of reports) {
      printReport(report);
    }

    console.log(pc.dim("  " + "─".repeat(60)));

    // Summary
    const withIssues = reports.filter((r) => r.riskLevel !== "LOW" && r.riskLevel !== "UNKNOWN");
    const npmReports = reports.filter((r) => r.source === "npm");
    const parts: string[] = [];
    parts.push(`${reports.length} server(s) scanned`);
    if (npmReports.length < reports.length) {
      parts.push(pc.dim(`${reports.length - npmReports.length} non-npm (unverified)`));
    }
    if (withIssues.length > 0) {
      parts.push(pc.yellow(`${withIssues.length} with issues`));
    } else {
      parts.push(pc.green("all clear"));
    }
    console.log(`\n  Summary: ${parts.join(" | ")}\n`);

    // --fix: auto-update vulnerable npm servers
    if (args.fix) {
      await runAuditFix(reports, lockfile.servers, args.yes);
    }
  },
});

// Load installed clients lazily (same pattern as update.ts)
async function loadClients(): Promise<ClientHandler[]> {
  try {
    const mod = await import("../clients/client-detector.js");
    return mod.getInstalledClients();
  } catch {
    return [];
  }
}

// Handle the --fix flow: check versions, confirm, apply, re-scan
async function runAuditFix(
  reports: SecurityReport[],
  servers: Record<string, import("../core/lockfile.js").LockEntry>,
  skipConfirm: boolean,
): Promise<void> {
  // Only npm sources can be auto-updated
  const npmWithVulns = reports.filter((r) => r.vulnerabilities.length > 0 && r.source === "npm");
  const nonNpmWithVulns = reports.filter((r) => r.vulnerabilities.length > 0 && r.source !== "npm");

  // Notify about non-npm servers that need manual attention
  if (nonNpmWithVulns.length > 0) {
    console.log(pc.yellow("  Non-npm servers require manual update:"));
    for (const r of nonNpmWithVulns) {
      console.log(`    ${pc.dim("→")} ${r.server} (${r.source})`);
    }
    console.log();
  }

  if (npmWithVulns.length === 0) {
    console.log(pc.green("  No fixable vulnerabilities found.\n"));
    return;
  }

  // Check which npm servers actually have an update available
  const versionSpinner = createSpinner("Checking for available updates...").start();
  const versionChecks = await Promise.all(
    npmWithVulns.map((r) => checkVersion(r.server, servers[r.server])),
  );
  versionSpinner.success({ text: "Version check complete" });

  const updatable = versionChecks.filter((u) => u.hasUpdate);

  if (updatable.length === 0) {
    console.log(
      pc.yellow(
        "  Vulnerable servers have no newer versions available yet.\n" +
          "  Allow time for registry to publish fixes.\n",
      ),
    );
    return;
  }

  // Show what will be updated
  console.log(
    pc.bold(`\n  ${updatable.length} server(s) can be updated to fix vulnerabilities:\n`),
  );
  for (const u of updatable) {
    console.log(
      `    ${pc.cyan("→")} ${u.server}  ${pc.dim(u.currentVersion)} → ${pc.green(u.latestVersion)}`,
    );
  }
  console.log();

  // Confirm unless --yes
  if (!skipConfirm) {
    const confirmed = await p.confirm({
      message: `Update ${updatable.length} vulnerable server(s)?`,
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.outro("Cancelled.");
      return;
    }
  }

  const clients = await loadClients();

  // Apply updates and collect results
  let successCount = 0;
  const results: Array<{ server: string; from: string; to: string; ok: boolean; error?: string }> =
    [];

  for (const u of updatable) {
    const s = createSpinner(`Updating ${u.server}...`).start();
    const result = await applyServerUpdate(u.server, servers[u.server], clients);
    if (result.success) {
      s.success({
        text: `${pc.green("✓")} ${u.server}: ${result.fromVersion} → ${result.toVersion}`,
      });
      successCount++;
    } else {
      s.error({ text: `${pc.red("✗")} ${u.server}: ${result.error}` });
    }
    results.push({
      server: u.server,
      from: result.fromVersion,
      to: result.toVersion,
      ok: result.success,
      error: result.error,
    });
  }

  console.log();

  // Re-scan updated servers to show improvement
  if (successCount > 0) {
    const updatedNames = results.filter((r) => r.ok).map((r) => r.server);
    const freshLockfile = readLockfile();
    const rescanSpinner = createSpinner("Re-scanning updated servers...").start();

    const afterReports = await Promise.all(
      updatedNames.map((name) => scanServer(name, freshLockfile.servers[name])),
    );
    rescanSpinner.success({ text: "Re-scan complete" });

    // Print before/after comparison
    console.log(pc.bold("\n  Before / After:\n"));
    for (const after of afterReports) {
      const before = reports.find((r) => r.server === after.server);
      const beforeVulns = before?.vulnerabilities.length ?? 0;
      const afterVulns = after.vulnerabilities.length;
      const improved = afterVulns < beforeVulns ? pc.green("improved") : pc.yellow("unchanged");
      console.log(
        `    ${pc.bold(after.server)}  vulns: ${beforeVulns} → ${afterVulns}  [${improved}]`,
      );
    }
    console.log();
  }

  console.log(`\n  ${successCount} of ${updatable.length} server(s) updated.\n`);
}
