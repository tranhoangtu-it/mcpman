/**
 * group.ts
 * CLI command: `mcpman group <action> <name> [servers...]`
 * Manage named server groups for batch install/run operations.
 */

import { spawn } from "node:child_process";
import { defineCommand } from "citty";
import pc from "picocolors";
import {
  addToGroup,
  deleteGroup,
  getGroup,
  groupExists,
  listGroups,
  removeFromGroup,
} from "../core/group-manager.js";
import { readLockfile } from "../core/lockfile.js";

// ── Sub-commands ──────────────────────────────────────────────────────────────

const addCmd = defineCommand({
  meta: { name: "add", description: "Add servers to a group" },
  args: {
    name: { type: "positional", description: "Group name", required: true },
    servers: { type: "positional", description: "Server name(s)", required: true },
  },
  run({ args }) {
    const servers = Array.isArray(args.servers) ? args.servers : [args.servers];
    addToGroup(args.name, servers);
    console.log(`${pc.green("✓")} Added ${servers.join(", ")} to group ${pc.cyan(args.name)}`);
  },
});

const rmCmd = defineCommand({
  meta: { name: "rm", description: "Remove servers from a group" },
  args: {
    name: { type: "positional", description: "Group name", required: true },
    servers: { type: "positional", description: "Server name(s)", required: true },
  },
  run({ args }) {
    const servers = Array.isArray(args.servers) ? args.servers : [args.servers];
    removeFromGroup(args.name, servers);
    console.log(`${pc.green("✓")} Removed ${servers.join(", ")} from group ${pc.cyan(args.name)}`);
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List all groups (or members of a group)" },
  args: {
    name: { type: "positional", description: "Group name (optional)", required: false },
  },
  run({ args }) {
    if (args.name) {
      const members = getGroup(args.name);
      if (members.length === 0) {
        console.log(pc.dim(`Group "${args.name}" is empty or does not exist.`));
        return;
      }
      console.log(`\n${pc.bold(pc.cyan(args.name))}`);
      for (const s of members) console.log(`  ${pc.green("●")} ${s}`);
      console.log("");
    } else {
      const groups = listGroups();
      if (groups.length === 0) {
        console.log(pc.dim("No groups defined. Use `mcpman group add <name> <server>`."));
        return;
      }
      console.log("");
      for (const g of groups) {
        const members = getGroup(g);
        console.log(
          `  ${pc.cyan(pc.bold(g))}  ${pc.dim(`(${members.length} server${members.length !== 1 ? "s" : ""})`)}`,
        );
        for (const s of members) console.log(`    ${pc.dim("·")} ${s}`);
      }
      console.log("");
    }
  },
});

const deleteCmd = defineCommand({
  meta: { name: "delete", description: "Delete an entire group" },
  args: {
    name: { type: "positional", description: "Group name", required: true },
  },
  run({ args }) {
    if (!groupExists(args.name)) {
      console.error(`${pc.red("✗")} Group "${args.name}" does not exist.`);
      process.exit(1);
    }
    deleteGroup(args.name);
    console.log(`${pc.green("✓")} Deleted group ${pc.cyan(args.name)}`);
  },
});

const installCmd = defineCommand({
  meta: { name: "install", description: "Install all servers in a group" },
  args: {
    name: { type: "positional", description: "Group name", required: true },
  },
  async run({ args }) {
    const members = getGroup(args.name);
    if (members.length === 0) {
      console.error(`${pc.red("✗")} Group "${args.name}" is empty or does not exist.`);
      process.exit(1);
    }
    console.log(
      `${pc.cyan("Installing")} group ${pc.bold(args.name)} (${members.length} servers)...`,
    );
    for (const server of members) {
      console.log(`\n  ${pc.dim("→")} Installing ${pc.bold(server)}...`);
      await runInstall(server);
    }
    console.log(`\n${pc.green("✓")} Group install complete.`);
  },
});

const runCmd = defineCommand({
  meta: { name: "run", description: "Run all servers in a group concurrently" },
  args: {
    name: { type: "positional", description: "Group name", required: true },
  },
  run({ args }) {
    const members = getGroup(args.name);
    if (members.length === 0) {
      console.error(`${pc.red("✗")} Group "${args.name}" is empty or does not exist.`);
      process.exit(1);
    }

    const lockfile = readLockfile();
    console.log(
      `${pc.cyan("Spawning")} group ${pc.bold(args.name)} (${members.length} servers)...\n`,
    );

    for (const server of members) {
      const entry = lockfile.servers[server];
      if (!entry) {
        console.warn(`  ${pc.yellow("!")} ${server} not in lockfile — skipping`);
        continue;
      }
      const child = spawn(entry.command, entry.args ?? [], {
        env: process.env,
        stdio: "inherit",
        detached: false,
      });
      child.on("error", (err) => {
        console.error(`  ${pc.red("✗")} ${server}: ${err.message}`);
      });
      console.log(`  ${pc.green("✓")} Spawned ${pc.bold(server)} (pid ${child.pid ?? "?"})`);
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function runInstall(server: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("mcpman", ["install", server], { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`install exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

// ── Main command ──────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "group",
    description: "Manage named server groups",
  },
  subCommands: {
    add: addCmd,
    rm: rmCmd,
    list: listCmd,
    delete: deleteCmd,
    install: installCmd,
    run: runCmd,
  },
});
