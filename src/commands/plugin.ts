/**
 * plugin.ts
 * CLI command: `mcpman plugin <add|remove|list>`
 * Manages mcpman plugin packages for custom registries.
 */

import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import {
  installPluginPackage,
  listPluginPackages,
  loadPlugin,
  removePluginPackage,
} from "../core/plugin-loader.js";

// ── Sub-command: add ───────────────────────────────────────────────────────

const addCommand = defineCommand({
  meta: { name: "add", description: "Install a plugin package" },
  args: {
    package: {
      type: "positional",
      description: "npm package name of the plugin",
      required: true,
    },
  },
  async run({ args }) {
    const pkg = args.package as string;
    const spinner = createSpinner(`Installing plugin ${pkg}...`).start();

    try {
      installPluginPackage(pkg);
      const loaded = loadPlugin(pkg);
      spinner.stop();

      if (loaded) {
        console.log(
          `${pc.green("✓")} Plugin ${pc.bold(loaded.name)} installed (prefix: ${pc.cyan(loaded.prefix)})`,
        );
      } else {
        console.log(
          `${pc.yellow("⚠")} Package ${pc.bold(pkg)} installed but does not export a valid mcpman plugin.`,
        );
      }
    } catch (err) {
      spinner.stop();
      console.error(
        `${pc.red("✗")} Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  },
});

// ── Sub-command: remove ────────────────────────────────────────────────────

const removeCommand = defineCommand({
  meta: { name: "remove", description: "Uninstall a plugin package" },
  args: {
    package: {
      type: "positional",
      description: "npm package name of the plugin",
      required: true,
    },
  },
  run({ args }) {
    const pkg = args.package as string;
    const installed = listPluginPackages();

    if (!installed.includes(pkg)) {
      console.log(pc.dim(`Plugin "${pkg}" is not installed.`));
      return;
    }

    try {
      removePluginPackage(pkg);
      console.log(`${pc.green("✓")} Plugin ${pc.bold(pkg)} removed.`);
    } catch (err) {
      console.error(
        `${pc.red("✗")} Failed to remove plugin: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  },
});

// ── Sub-command: list ──────────────────────────────────────────────────────

const listCommand = defineCommand({
  meta: { name: "list", description: "List installed plugins" },
  run() {
    const packages = listPluginPackages();

    if (packages.length === 0) {
      console.log(pc.dim("No plugins installed. Use `mcpman plugin add <package>`."));
      return;
    }

    console.log("");
    console.log(pc.bold("Installed plugins:"));
    console.log("");

    for (const pkg of packages) {
      const loaded = loadPlugin(pkg);
      if (loaded) {
        console.log(
          `  ${pc.green("●")} ${pc.bold(loaded.name)}  prefix: ${pc.cyan(loaded.prefix)}  pkg: ${pc.dim(pkg)}`,
        );
      } else {
        console.log(`  ${pc.yellow("●")} ${pc.dim(pkg)}  ${pc.yellow("(failed to load)")}`);
      }
    }

    console.log("");
    console.log(pc.dim(`  ${packages.length} plugin${packages.length !== 1 ? "s" : ""} installed`));
  },
});

// ── Main command ───────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "plugin",
    description: "Manage mcpman plugins for custom registries",
  },
  subCommands: {
    add: addCommand,
    remove: removeCommand,
    list: listCommand,
  },
});
