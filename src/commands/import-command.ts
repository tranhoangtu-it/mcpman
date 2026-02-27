/**
 * import-command.ts
 * CLI command: `mcpman import <file>`
 * Restores mcpman config, lockfile, vault, and plugins from an export bundle.
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { type ExportBundle, importBundle, validateBundle } from "../core/export-import-service.js";

export default defineCommand({
  meta: {
    name: "import",
    description: "Import mcpman config, lockfile, vault, and plugins from an export file",
  },
  args: {
    file: {
      type: "positional",
      description: "Path to mcpman export JSON file",
      required: true,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompts",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Preview import without applying changes",
      default: false,
    },
  },
  async run({ args }) {
    const filePath = path.resolve(args.file as string);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      console.error(`${pc.red("✗")} File not found: ${filePath}`);
      process.exit(1);
    }

    // Parse JSON
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      console.error(`${pc.red("✗")} Invalid JSON in ${filePath}`);
      process.exit(1);
    }

    // Validate bundle structure
    const error = validateBundle(raw);
    if (error) {
      console.error(`${pc.red("✗")} Invalid export bundle: ${error}`);
      process.exit(1);
    }

    const bundle = raw as ExportBundle;
    const serverCount = Object.keys(bundle.lockfile.servers).length;
    const configKeys = Object.keys(bundle.config).length;
    const pluginCount = bundle.plugins?.length ?? 0;
    const hasVault = !!bundle.vault;
    const isDryRun = !!args["dry-run"];

    // Show summary
    console.log("");
    console.log(pc.bold("Import summary:"));
    console.log(pc.dim(`  Source version: mcpman ${bundle.mcpmanVersion}`));
    console.log(pc.dim(`  Exported at: ${bundle.exportedAt}`));
    console.log(`  Config keys: ${pc.cyan(String(configKeys))}`);
    console.log(`  Servers: ${pc.cyan(String(serverCount))}`);
    console.log(`  Vault: ${hasVault ? pc.green("included") : pc.dim("not included")}`);
    console.log(`  Plugins: ${pc.cyan(String(pluginCount))}`);
    console.log("");

    if (isDryRun) {
      console.log(pc.yellow("  [dry-run] No changes applied."));
      return;
    }

    // Confirm unless --yes
    if (!args.yes) {
      const confirmed = await p.confirm({
        message: "This will overwrite existing config and lockfile. Continue?",
        initialValue: false,
      });

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Import cancelled.");
        return;
      }
    }

    // Apply import
    const summary = importBundle(bundle, { dryRun: false });

    console.log(`${pc.green("✓")} Import complete`);
    console.log(pc.dim(`  Config keys restored: ${summary.configKeys}`));
    console.log(pc.dim(`  Servers restored: ${summary.servers}`));
    console.log(pc.dim(`  Vault: ${summary.vaultImported ? "restored" : "skipped"}`));
    console.log(pc.dim(`  Plugins installed: ${summary.pluginsInstalled}`));
  },
});
