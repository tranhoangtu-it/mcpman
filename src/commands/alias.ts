/**
 * alias.ts
 * `mcpman alias` — manage command aliases stored at ~/.mcpman/aliases.json
 * Sub-actions: add, remove, list
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { addAlias, aliasExists, listAliases, removeAlias } from "../core/alias-manager.js";

// ── Sub-commands ──────────────────────────────────────────────────────────────

const addCmd = defineCommand({
  meta: { name: "add", description: "Add a command alias" },
  args: {
    name: { type: "positional", description: "Alias name", required: true },
    command: { type: "positional", description: "Full command string to alias", required: true },
  },
  run({ args }) {
    addAlias(args.name, args.command);
    console.log(
      `${pc.green("✓")} Alias ${pc.cyan(pc.bold(args.name))} → ${pc.dim(args.command)} saved`,
    );
  },
});

const removeCmd = defineCommand({
  meta: { name: "remove", description: "Remove an alias" },
  args: {
    name: { type: "positional", description: "Alias name to remove", required: true },
  },
  run({ args }) {
    if (!aliasExists(args.name)) {
      console.error(`${pc.red("✗")} Alias "${args.name}" does not exist.`);
      process.exit(1);
    }
    removeAlias(args.name);
    console.log(`${pc.green("✓")} Alias ${pc.cyan(args.name)} removed`);
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List all aliases" },
  args: {},
  run() {
    const aliases = listAliases();
    if (aliases.length === 0) {
      console.log(pc.dim("\n  No aliases defined. Use `mcpman alias add <name> <command>`.\n"));
      return;
    }
    const nameW = Math.max(4, ...aliases.map((a) => a.name.length));
    console.log(pc.bold("\n  mcpman aliases\n"));
    console.log(pc.dim(`  ${"─".repeat(nameW + 30)}`));
    for (const { name, command } of aliases) {
      const padded = name.padEnd(nameW);
      console.log(`  ${pc.cyan(pc.bold(padded))}  ${pc.dim("→")}  ${command}`);
    }
    console.log(pc.dim(`  ${"─".repeat(nameW + 30)}\n`));
  },
});

// ── Main command ──────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "alias",
    description: "Manage command aliases",
  },
  subCommands: {
    add: addCmd,
    remove: removeCmd,
    list: listCmd,
  },
});
