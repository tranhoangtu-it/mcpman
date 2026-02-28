/**
 * template.ts
 * `mcpman template` — install templates saved at ~/.mcpman/templates/
 * Sub-actions: save, apply, list, delete
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import {
  applyTemplate,
  deleteTemplate,
  listTemplates,
  loadTemplate,
  saveTemplate,
} from "../core/template-service.js";

// ── Sub-commands ──────────────────────────────────────────────────────────────

const saveCmd = defineCommand({
  meta: { name: "save", description: "Save current lockfile servers as a named template" },
  args: {
    name: { type: "positional", description: "Template name", required: true },
    description: {
      type: "string",
      description: "Optional description for the template",
    },
  },
  run({ args }) {
    try {
      saveTemplate(args.name, { description: args.description });
      const tmpl = loadTemplate(args.name);
      const count = tmpl?.servers.length ?? 0;
      console.log(
        `${pc.green("✓")} Template ${pc.cyan(pc.bold(args.name))} saved (${count} server${count !== 1 ? "s" : ""})`,
      );
    } catch (err) {
      console.error(`${pc.red("✗")} ${String(err)}`);
      process.exit(1);
    }
  },
});

const applyCmd = defineCommand({
  meta: { name: "apply", description: "Print install commands for a template" },
  args: {
    name: { type: "positional", description: "Template name", required: true },
  },
  run({ args }) {
    let commands: string[];
    try {
      commands = applyTemplate(args.name);
    } catch (err) {
      console.error(`${pc.red("✗")} ${String(err)}`);
      process.exit(1);
    }

    if (commands.length === 0) {
      console.log(pc.dim(`\n  Template "${args.name}" has no servers.\n`));
      return;
    }

    console.log(pc.bold(`\n  Template: ${pc.cyan(args.name)}\n`));
    console.log(pc.dim("  Run the following commands to install all servers:\n"));
    for (const cmd of commands) {
      console.log(`  ${pc.green("$")} ${cmd}`);
    }
    console.log();
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List all saved templates" },
  args: {},
  run() {
    const names = listTemplates();
    if (names.length === 0) {
      console.log(pc.dim("\n  No templates saved. Use `mcpman template save <name>`.\n"));
      return;
    }
    console.log(pc.bold("\n  mcpman templates\n"));
    console.log(pc.dim(`  ${"─".repeat(50)}`));
    for (const name of names) {
      const tmpl = loadTemplate(name);
      const count = tmpl?.servers.length ?? 0;
      const desc = tmpl?.description ? pc.dim(`  — ${tmpl.description}`) : "";
      console.log(
        `  ${pc.cyan(pc.bold(name.padEnd(20)))}  ${pc.dim(`${count} server${count !== 1 ? "s" : ""}`)}${desc}`,
      );
    }
    console.log(pc.dim(`  ${"─".repeat(50)}\n`));
  },
});

const deleteCmd = defineCommand({
  meta: { name: "delete", description: "Delete a saved template" },
  args: {
    name: { type: "positional", description: "Template name", required: true },
  },
  run({ args }) {
    const existing = listTemplates();
    if (!existing.includes(args.name)) {
      console.error(`${pc.red("✗")} Template "${args.name}" does not exist.`);
      process.exit(1);
    }
    deleteTemplate(args.name);
    console.log(`${pc.green("✓")} Template ${pc.cyan(args.name)} deleted`);
  },
});

// ── Main command ──────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "template",
    description: "Manage install templates",
  },
  subCommands: {
    save: saveCmd,
    apply: applyCmd,
    list: listCmd,
    delete: deleteCmd,
  },
});
