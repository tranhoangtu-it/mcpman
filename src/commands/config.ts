/**
 * config.ts
 * CLI command: `mcpman config <set|get|list|reset>`
 * Manages persistent CLI configuration at ~/.mcpman/config.json.
 */

import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getConfigValue, readConfig, setConfigValue, writeConfig } from "../core/config-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Coerce a string value to the appropriate JS type.
 * Numbers stay numbers, booleans stay booleans, rest are strings.
 */
function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}

// ── Sub-command: set ───────────────────────────────────────────────────────

const setCommand = defineCommand({
  meta: { name: "set", description: "Set a config value" },
  args: {
    key: {
      type: "positional",
      description: "Config key (e.g. defaultClient)",
      required: true,
    },
    value: {
      type: "positional",
      description: "Value to set",
      required: true,
    },
  },
  run({ args }) {
    try {
      const coerced = coerceValue(args.value);
      setConfigValue(args.key, coerced);
      console.log(`${pc.green("✓")} Set ${pc.bold(args.key)} = ${pc.cyan(String(coerced))}`);
    } catch (err) {
      console.error(`${pc.red("✗")} ${String(err)}`);
      process.exit(1);
    }
  },
});

// ── Sub-command: get ───────────────────────────────────────────────────────

const getCommand = defineCommand({
  meta: { name: "get", description: "Get a config value" },
  args: {
    key: {
      type: "positional",
      description: "Config key to read",
      required: true,
    },
  },
  run({ args }) {
    const val = getConfigValue(args.key);
    if (val === undefined) {
      console.log(pc.dim(`${args.key}: (not set)`));
    } else {
      console.log(`${pc.bold(args.key)}: ${pc.cyan(String(val))}`);
    }
  },
});

// ── Sub-command: list ──────────────────────────────────────────────────────

const listCommand = defineCommand({
  meta: { name: "list", description: "List all config values" },
  run() {
    const data = readConfig();
    const entries = Object.entries(data);

    if (entries.length === 0) {
      console.log(pc.dim("No config values set. Use `mcpman config set <key> <value>`."));
      return;
    }

    console.log("");
    console.log(pc.bold("mcpman config:"));
    console.log("");
    for (const [key, val] of entries) {
      console.log(`  ${pc.green("●")} ${pc.bold(key)}  ${pc.cyan(String(val))}`);
    }
    console.log("");
    console.log(pc.dim(`  ${entries.length} key${entries.length !== 1 ? "s" : ""} configured`));
  },
});

// ── Sub-command: reset ─────────────────────────────────────────────────────

const resetCommand = defineCommand({
  meta: { name: "reset", description: "Reset config to defaults (removes config file)" },
  async run() {
    const confirmed = await p.confirm({
      message: "Reset all config values to defaults?",
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
      return;
    }

    writeConfig({});
    console.log(`${pc.green("✓")} Config reset to defaults.`);
  },
});

// ── Main command ───────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "config",
    description: "Manage mcpman CLI configuration",
  },
  subCommands: {
    set: setCommand,
    get: getCommand,
    list: listCommand,
    reset: resetCommand,
  },
});
