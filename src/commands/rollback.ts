/**
 * rollback.ts
 * CLI command: `mcpman rollback [index]`
 * Restore a previous lockfile snapshot from ~/.mcpman/rollback/
 * Flags: --list (show history)
 */

import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { resolveLockfilePath } from "../core/lockfile.js";
import { listSnapshots, readSnapshot, restoreSnapshot } from "../core/rollback-service.js";

export default defineCommand({
  meta: {
    name: "rollback",
    description: "Restore a previous lockfile snapshot",
  },
  args: {
    index: {
      type: "positional",
      description: "Snapshot index to restore (0 = most recent). Omit to use --list.",
      required: false,
    },
    list: {
      type: "boolean",
      description: "List available snapshots",
      default: false,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    const snapshots = listSnapshots();

    // --list: display snapshot history
    if (args.list || args.index === undefined) {
      if (snapshots.length === 0) {
        console.log(
          pc.dim("No snapshots available. Snapshots are created on each lockfile write."),
        );
        return;
      }

      console.log(
        `\n  ${pc.bold("Lockfile snapshots")}  ${pc.dim(`(${snapshots.length} available, 0 = most recent)`)}\n`,
      );
      for (const snap of snapshots) {
        const size = `${Math.ceil(snap.sizeBytes / 1024)}KB`;
        const date = snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "unknown";
        console.log(`  ${pc.cyan(`[${snap.index}]`)}  ${pc.dim(date)}  ${pc.dim(size)}`);
      }
      console.log("");

      if (args.index === undefined) return;
    }

    const idx = Number.parseInt(String(args.index), 10);
    if (Number.isNaN(idx) || idx < 0) {
      console.error(
        `${pc.red("✗")} Invalid index "${args.index}". Must be a non-negative integer.`,
      );
      process.exit(1);
    }

    const snap = snapshots[idx];
    if (!snap) {
      console.error(
        `${pc.red("✗")} Snapshot [${idx}] does not exist. Use --list to see available snapshots.`,
      );
      process.exit(1);
    }

    // Show diff preview
    const content = readSnapshot(idx);
    if (!content) {
      console.error(`${pc.red("✗")} Could not read snapshot [${idx}].`);
      process.exit(1);
    }

    const date = snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "unknown";
    console.log(`\n  ${pc.bold("Restoring snapshot")} ${pc.cyan(`[${idx}]`)}  ${pc.dim(date)}\n`);

    // Show server count in snapshot for preview
    try {
      const parsed = JSON.parse(content) as { servers?: Record<string, unknown> };
      const count = Object.keys(parsed.servers ?? {}).length;
      console.log(`  ${pc.dim(`Preview: ${count} server(s) in snapshot`)}\n`);
    } catch {
      /* ignore parse error */
    }

    const lockfilePath = resolveLockfilePath();

    if (!args.yes) {
      const confirmed = await p.confirm({
        message: `Restore snapshot [${idx}] to ${lockfilePath}?`,
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Cancelled.");
        return;
      }
    }

    const restored = restoreSnapshot(idx, lockfilePath);
    if (!restored) {
      console.error(`${pc.red("✗")} Restore failed.`);
      process.exit(1);
    }

    console.log(`\n${pc.green("✓")} Lockfile restored from snapshot [${idx}].`);
    console.log(pc.dim(`  Written to: ${lockfilePath}`));
  },
});
