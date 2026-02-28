/**
 * replay.ts
 * `mcpman replay` — CLI history playback.
 * --list  Show last 20 commands
 * [index] Re-run command at index (0 = most recent)
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { getHistory, replayCommand } from "../core/history-service.js";

export default defineCommand({
  meta: {
    name: "replay",
    description: "Replay a previous mcpman command from history",
  },
  args: {
    index: {
      type: "positional",
      description: "History index to replay (0 = most recent)",
      required: false,
    },
    list: {
      type: "boolean",
      description: "Show last 20 history entries",
      default: false,
    },
  },
  run({ args }) {
    const history = getHistory();

    if (args.list || args.index === undefined) {
      if (history.length === 0) {
        console.log(pc.dim("\n  No command history found.\n"));
        return;
      }

      const reversed = [...history].reverse().slice(0, 20);
      console.log(pc.bold("\n  mcpman history\n"));
      console.log(pc.dim(`  ${"─".repeat(50)}`));
      reversed.forEach((entry, i) => {
        const cmdParts = [entry.command, ...entry.args].filter(Boolean).join(" ");
        const ts = new Date(entry.timestamp).toLocaleString();
        console.log(`  ${pc.cyan(String(i).padStart(2))}  ${pc.bold(cmdParts)}  ${pc.dim(ts)}`);
      });
      console.log(pc.dim(`  ${"─".repeat(50)}\n`));
      if (!args.list) {
        console.log(pc.dim("  Usage: mcpman replay <index> | mcpman replay --list\n"));
      }
      return;
    }

    const idx = Number(args.index);
    if (Number.isNaN(idx) || idx < 0) {
      console.error(pc.red(`\n  Invalid index "${args.index}". Must be a non-negative number.\n`));
      process.exit(1);
    }

    const reversed = [...history].reverse();
    if (idx >= reversed.length) {
      console.error(
        pc.red(`\n  Index ${idx} out of range. History has ${reversed.length} entries.\n`),
      );
      process.exit(1);
    }

    const entry = reversed[idx];
    const cmdParts = [entry.command, ...entry.args].filter(Boolean).join(" ");
    console.log(pc.cyan(`\n  Replaying: mcpman ${cmdParts}\n`));

    try {
      replayCommand(idx);
    } catch (err) {
      console.error(pc.red(`  ${String(err)}`));
      process.exit(1);
    }
  },
});
