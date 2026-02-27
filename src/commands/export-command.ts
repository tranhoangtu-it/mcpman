/**
 * export-command.ts
 * CLI command: `mcpman export [output-file]`
 * Creates a portable JSON bundle of mcpman config, lockfile, vault, and plugins.
 */

import fs from "node:fs";
import path from "node:path";
import { defineCommand } from "citty";
import pc from "picocolors";
import { createExportBundle } from "../core/export-import-service.js";

const DEFAULT_OUTPUT = "mcpman-export.json";

export default defineCommand({
  meta: {
    name: "export",
    description: "Export mcpman config, lockfile, vault, and plugins to a portable JSON file",
  },
  args: {
    output: {
      type: "positional",
      description: `Output file path (default: ${DEFAULT_OUTPUT})`,
      required: false,
    },
    "no-vault": {
      type: "boolean",
      description: "Exclude encrypted vault from export",
      default: false,
    },
    "no-plugins": {
      type: "boolean",
      description: "Exclude plugin list from export",
      default: false,
    },
  },
  run({ args }) {
    const outputFile = (args.output as string) || DEFAULT_OUTPUT;
    const outputPath = path.resolve(outputFile);

    const bundle = createExportBundle({
      includeVault: !args["no-vault"],
      includePlugins: !args["no-plugins"],
    });

    const serverCount = Object.keys(bundle.lockfile.servers).length;
    const configKeys = Object.keys(bundle.config).length;

    fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2), "utf-8");

    console.log(`${pc.green("✓")} Exported to ${pc.bold(outputFile)}`);
    console.log(pc.dim(`  Config keys: ${configKeys}`));
    console.log(pc.dim(`  Servers: ${serverCount}`));
    console.log(pc.dim(`  Vault: ${bundle.vault ? "included" : "excluded"}`));
    console.log(pc.dim(`  Plugins: ${bundle.plugins?.length ?? 0}`));
  },
});
