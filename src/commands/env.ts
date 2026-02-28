/**
 * env.ts
 * CLI command: `mcpman env <action> <server> [key[=value]...]`
 * Per-server plain env var CRUD. For sensitive values, use `mcpman secrets`.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import {
  clearEnv,
  deleteEnv,
  getEnv,
  listEnv,
  listEnvServers,
  setEnv,
} from "../core/env-manager.js";

// ── Sub-commands ──────────────────────────────────────────────────────────────

const setCmd = defineCommand({
  meta: { name: "set", description: "Set env var(s) for a server" },
  args: {
    server: { type: "positional", description: "Server name", required: true },
    pairs: { type: "positional", description: "KEY=VALUE pair(s)", required: true },
  },
  run({ args }) {
    const pairs = Array.isArray(args.pairs) ? args.pairs : [args.pairs];
    for (const pair of pairs) {
      const idx = pair.indexOf("=");
      if (idx <= 0) {
        console.error(`${pc.red("✗")} Invalid format: "${pair}". Expected KEY=VALUE`);
        process.exit(1);
      }
      const key = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      setEnv(args.server, key, value);
      console.log(
        `${pc.green("✓")} Set ${pc.bold(key)}=${pc.dim(value)} for ${pc.cyan(args.server)}`,
      );
    }
  },
});

const getCmd = defineCommand({
  meta: { name: "get", description: "Get an env var for a server" },
  args: {
    server: { type: "positional", description: "Server name", required: true },
    key: { type: "positional", description: "Variable name", required: true },
  },
  run({ args }) {
    const value = getEnv(args.server, args.key);
    if (value === null) {
      console.error(`${pc.red("✗")} No env var "${args.key}" for ${pc.cyan(args.server)}`);
      process.exit(1);
    }
    console.log(value);
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List env vars for a server (or all servers)" },
  args: {
    server: { type: "positional", description: "Server name (optional)", required: false },
  },
  run({ args }) {
    if (args.server) {
      const store = listEnv(args.server);
      const keys = Object.keys(store);
      if (keys.length === 0) {
        console.log(pc.dim(`No env vars for ${pc.cyan(args.server)}.`));
        return;
      }
      console.log(`\n${pc.bold(pc.cyan(args.server))}`);
      for (const [k, v] of Object.entries(store)) {
        console.log(`  ${pc.green("●")} ${pc.bold(k)}=${pc.dim(v)}`);
      }
      console.log("");
    } else {
      const servers = listEnvServers();
      if (servers.length === 0) {
        console.log(pc.dim("No env vars stored."));
        return;
      }
      for (const srv of servers) {
        const store = listEnv(srv);
        console.log(`\n${pc.bold(pc.cyan(srv))}`);
        for (const [k, v] of Object.entries(store)) {
          console.log(`  ${pc.green("●")} ${pc.bold(k)}=${pc.dim(v)}`);
        }
      }
      console.log("");
    }
  },
});

const delCmd = defineCommand({
  meta: { name: "del", description: "Delete an env var for a server" },
  args: {
    server: { type: "positional", description: "Server name", required: true },
    key: { type: "positional", description: "Variable name to delete", required: true },
  },
  run({ args }) {
    deleteEnv(args.server, args.key);
    console.log(`${pc.green("✓")} Deleted ${pc.bold(args.key)} from ${pc.cyan(args.server)}`);
  },
});

const clearCmd = defineCommand({
  meta: { name: "clear", description: "Clear all env vars for a server" },
  args: {
    server: { type: "positional", description: "Server name", required: true },
  },
  run({ args }) {
    clearEnv(args.server);
    console.log(`${pc.green("✓")} Cleared all env vars for ${pc.cyan(args.server)}`);
  },
});

// ── Main command ──────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "env",
    description: "Manage per-server environment variables (non-sensitive)",
  },
  subCommands: {
    set: setCmd,
    get: getCmd,
    list: listCmd,
    del: delCmd,
    clear: clearCmd,
  },
});
