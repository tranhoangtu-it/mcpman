/**
 * secrets.ts
 * CLI command: `mcpman secrets <set|list|remove> ...`
 * Manages encrypted secrets stored in the local vault (~/.mcpman/vault.enc).
 */

import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getMasterPassword, listSecrets, removeSecret, setSecret } from "../core/vault-service.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mask a secret value for display.
 * Short values (<= 8 chars): fully masked as "***".
 * Longer values: first 4 chars + "***" + last 3 chars.
 */
function maskValue(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
}

/** Parse "KEY=VALUE" string. Returns null if format is invalid. */
function parseKeyValue(input: string): { key: string; value: string } | null {
  const idx = input.indexOf("=");
  if (idx <= 0) return null;
  return { key: input.slice(0, idx), value: input.slice(idx + 1) };
}

// ── Sub-command: set ───────────────────────────────────────────────────────

const setCommand = defineCommand({
  meta: { name: "set", description: "Store an encrypted secret for a server" },
  args: {
    server: {
      type: "positional",
      description: "Server name (e.g. @modelcontextprotocol/server-github)",
      required: true,
    },
    keyvalue: {
      type: "positional",
      description: "KEY=VALUE pair to store",
      required: true,
    },
  },
  async run({ args }) {
    const parsed = parseKeyValue(args.keyvalue);
    if (!parsed) {
      console.error(`${pc.red("✗")} Invalid format. Expected KEY=VALUE`);
      process.exit(1);
    }

    p.intro(pc.cyan("mcpman secrets set"));

    const isNew =
      listSecrets(args.server).length === 0 ||
      !listSecrets(args.server)[0]?.keys.includes(parsed.key);

    // First-time vault creation: confirm password
    const vaultPath = (await import("../core/vault-service.js")).getVaultPath();
    const vaultExists = (await import("node:fs")).existsSync(vaultPath);
    const password = await getMasterPassword(!vaultExists && isNew);

    const spin = p.spinner();
    spin.start("Encrypting secret...");
    try {
      setSecret(args.server, parsed.key, parsed.value, password);
      spin.stop(`${pc.green("✓")} Stored ${pc.bold(parsed.key)} for ${pc.cyan(args.server)}`);
    } catch (err) {
      spin.stop(`${pc.red("✗")} Failed to store secret`);
      console.error(pc.dim(String(err)));
      process.exit(1);
    }

    p.outro(pc.dim("Secret encrypted and saved to vault."));
  },
});

// ── Sub-command: list ──────────────────────────────────────────────────────

const listCommand = defineCommand({
  meta: { name: "list", description: "List secret keys stored in the vault" },
  args: {
    server: {
      type: "positional",
      description: "Filter by server name (optional)",
      required: false,
    },
  },
  async run({ args }) {
    const results = listSecrets(args.server || undefined);

    if (results.length === 0) {
      const filter = args.server ? ` for ${pc.cyan(args.server)}` : "";
      console.log(pc.dim(`No secrets stored${filter}.`));
      return;
    }

    console.log("");
    for (const { server, keys } of results) {
      console.log(pc.bold(pc.cyan(server)));
      for (const key of keys) {
        // Display key with masked placeholder (no decryption)
        console.log(`  ${pc.green("●")} ${pc.bold(key)}  ${pc.dim(maskValue("••••••••••••"))}`);
      }
      console.log("");
    }

    const total = results.reduce((n, r) => n + r.keys.length, 0);
    console.log(
      pc.dim(
        `  ${total} secret${total !== 1 ? "s" : ""} in ${results.length} server${results.length !== 1 ? "s" : ""}`,
      ),
    );
  },
});

// ── Sub-command: remove ────────────────────────────────────────────────────

const removeCommand = defineCommand({
  meta: { name: "remove", description: "Delete a secret from the vault" },
  args: {
    server: {
      type: "positional",
      description: "Server name",
      required: true,
    },
    key: {
      type: "positional",
      description: "Secret key to remove",
      required: true,
    },
  },
  async run({ args }) {
    // Confirm before deletion
    const confirmed = await p.confirm({
      message: `Remove ${pc.bold(args.key)} from ${pc.cyan(args.server)}?`,
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
      return;
    }

    try {
      removeSecret(args.server, args.key);
      console.log(`${pc.green("✓")} Removed ${pc.bold(args.key)} from ${pc.cyan(args.server)}`);
    } catch (err) {
      console.error(`${pc.red("✗")} Failed to remove secret`);
      console.error(pc.dim(String(err)));
      process.exit(1);
    }
  },
});

// ── Main command ───────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "secrets",
    description: "Manage encrypted secrets for MCP servers",
  },
  subCommands: {
    set: setCommand,
    list: listCommand,
    remove: removeCommand,
  },
});
