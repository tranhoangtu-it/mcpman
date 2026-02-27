import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readLockfile, addEntry, resolveLockfilePath } from "../core/lockfile.js";
import { checkAllVersions, type UpdateInfo } from "../core/version-checker.js";
import { writeUpdateCache } from "../core/update-notifier.js";
import { resolveServer } from "../core/server-resolver.js";
import { computeIntegrity } from "../core/registry.js";
import type { ClientHandler } from "../clients/types.js";

async function loadClients(): Promise<ClientHandler[]> {
  try {
    const mod = await import("../clients/client-detector.js");
    return mod.getInstalledClients();
  } catch {
    return [];
  }
}

function printTable(updates: UpdateInfo[]): void {
  const NAME_W = 28;
  const VER_W = 10;
  const header = [
    "NAME".padEnd(NAME_W),
    "CURRENT".padEnd(VER_W),
    "LATEST".padEnd(VER_W),
    "STATUS",
  ].join("  ");
  console.log(pc.bold(`\n  ${header}`));
  console.log(pc.dim(`  ${"─".repeat(NAME_W + VER_W * 2 + 20)}`));

  for (const u of updates) {
    const nameCol = u.server.slice(0, NAME_W).padEnd(NAME_W);
    const curCol = u.currentVersion.padEnd(VER_W);
    const latCol = u.latestVersion.padEnd(VER_W);
    const statusCol = u.hasUpdate
      ? pc.yellow(`Update available${u.updateType ? ` [${u.updateType}]` : ""}`)
      : pc.green("Up to date");
    console.log(`  ${nameCol}  ${curCol}  ${latCol}  ${statusCol}`);
  }
  console.log();
}

export default defineCommand({
  meta: {
    name: "update",
    description: "Check for and apply updates to installed MCP servers",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to update (omit to update all)",
      required: false,
    },
    check: {
      type: "boolean",
      description: "Check only — do not apply updates",
      default: false,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const lockfile = readLockfile();
    const servers = lockfile.servers;

    // Filter to single server if specified
    const targetEntries = args.server
      ? Object.entries(servers).filter(([name]) => name === args.server)
      : Object.entries(servers);

    if (targetEntries.length === 0) {
      if (args.server) {
        console.error(`Server '${args.server}' not found in lockfile.`);
      } else {
        console.log("No servers installed. Run mcpman install <server> first.");
      }
      process.exit(1);
    }

    // Check versions with spinner
    const spinner = p.spinner();
    spinner.start("Checking versions...");

    let updates: UpdateInfo[];
    try {
      const partialLock = {
        lockfileVersion: 1 as const,
        servers: Object.fromEntries(targetEntries),
      };
      updates = await checkAllVersions(partialLock);
    } catch (err) {
      spinner.stop("Version check failed");
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    spinner.stop(`Checked ${updates.length} server(s)`);

    // JSON output mode
    if (args.json) {
      console.log(JSON.stringify(updates, null, 2));
      return;
    }

    printTable(updates);

    const outdated = updates.filter((u) => u.hasUpdate);

    if (outdated.length === 0) {
      console.log(pc.green("  All servers are up to date."));
      return;
    }

    if (args.check) {
      console.log(pc.yellow(`  ${outdated.length} update(s) available. Run mcpman update to apply.`));
      return;
    }

    // Confirm before applying
    if (!args.yes) {
      const confirmed = await p.confirm({
        message: `Apply ${outdated.length} update(s)?`,
        initialValue: true,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.outro("Cancelled.");
        return;
      }
    }

    // Load clients once
    const clients = await loadClients();

    // Apply updates
    let successCount = 0;
    for (const update of outdated) {
      const lockEntry = servers[update.server];
      const input =
        lockEntry.source === "smithery"
          ? `smithery:${update.server}`
          : lockEntry.source === "github"
            ? lockEntry.resolved
            : update.server;

      const s = p.spinner();
      s.start(`Updating ${update.server}...`);

      try {
        const metadata = await resolveServer(input);
        const integrity = computeIntegrity(metadata.resolved);

        // Update lockfile entry
        addEntry(update.server, {
          ...lockEntry,
          version: metadata.version,
          resolved: metadata.resolved,
          integrity,
          command: metadata.command,
          args: metadata.args,
          installedAt: new Date().toISOString(),
        });

        // Re-write to each client config
        const entryClients = clients.filter((c) =>
          lockEntry.clients.includes(c.type)
        );
        for (const client of entryClients) {
          try {
            await client.addServer(update.server, {
              command: metadata.command,
              args: metadata.args,
            });
          } catch {
            // Non-fatal: log but continue
          }
        }

        s.stop(`${pc.green("✓")} ${update.server}: ${update.currentVersion} → ${metadata.version}`);
        successCount++;
      } catch (err) {
        s.stop(`${pc.red("✗")} ${update.server}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Refresh update cache after applying
    const freshLockfile = readLockfile(resolveLockfilePath());
    const freshUpdates = await checkAllVersions(freshLockfile);
    writeUpdateCache({ lastCheck: new Date().toISOString(), updates: freshUpdates });

    p.outro(`${successCount} of ${outdated.length} server(s) updated.`);
  },
});
