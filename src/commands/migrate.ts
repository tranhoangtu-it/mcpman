/**
 * migrate.ts
 * `mcpman migrate` — migrate MCP server configs between AI clients.
 *
 * Reads server entries from a source client config and writes them into
 * a target client config, using the existing ClientHandler adapters so
 * format differences (JSON / TOML / YAML) are handled transparently.
 *
 * Flags:
 *   --from   Source client name (required)
 *   --to     Target client name (required)
 *   --yes    Skip confirmation prompt
 *   --dry-run  Preview without writing
 */

import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getClient } from "../clients/client-detector.js";
import type { ClientType, ServerEntry } from "../clients/types.js";
import { CLIENT_DISPLAY } from "./shared-helpers.js";

// All supported client IDs — kept in sync with ClientType union
const VALID_CLIENTS: ClientType[] = [
  "claude-desktop",
  "cursor",
  "vscode",
  "windsurf",
  "claude-code",
  "roo-code",
  "codex-cli",
  "opencode",
  "continue",
  "zed",
];

function clientLabel(type: ClientType): string {
  return CLIENT_DISPLAY[type] ?? type;
}

function validateClient(value: string, flag: string): ClientType {
  if (!VALID_CLIENTS.includes(value as ClientType)) {
    console.error(
      `${pc.red("✗")} Invalid --${flag} "${value}". ` +
        `Must be one of: ${VALID_CLIENTS.join(", ")}`,
    );
    process.exit(1);
  }
  return value as ClientType;
}

export default defineCommand({
  meta: {
    name: "migrate",
    description: "Migrate MCP server configs from one AI client to another",
  },
  args: {
    from: {
      type: "string",
      description:
        "Source client (claude-desktop, cursor, vscode, windsurf, claude-code, roo-code, codex-cli, opencode, continue, zed)",
      required: true,
    },
    to: {
      type: "string",
      description: "Target client (same options as --from)",
      required: true,
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Preview changes without writing to target client config",
      default: false,
    },
  },
  async run({ args }) {
    const fromType = validateClient(args.from, "from");
    const toType = validateClient(args.to, "to");

    if (fromType === toType) {
      console.error(`${pc.red("✗")} --from and --to must be different clients.`);
      process.exit(1);
    }

    const fromLabel = clientLabel(fromType);
    const toLabel = clientLabel(toType);

    p.intro(`${pc.cyan("mcpman migrate")} ${pc.dim(`${fromLabel} → ${toLabel}`)}`);

    // --- Read source config --------------------------------------------------
    const fromHandler = getClient(fromType);
    const fromInstalled = await fromHandler.isInstalled();
    if (!fromInstalled) {
      p.log.error(`Source client "${fromLabel}" does not appear to be installed.`);
      process.exit(1);
    }

    let sourceServers: Record<string, ServerEntry>;
    try {
      const config = await fromHandler.readConfig();
      sourceServers = config.servers;
    } catch (err) {
      p.log.error(`Failed to read source config: ${String(err)}`);
      process.exit(1);
    }

    const serverNames = Object.keys(sourceServers);
    if (serverNames.length === 0) {
      p.outro(pc.dim(`No servers found in ${fromLabel} — nothing to migrate.`));
      return;
    }

    // --- Read target config to detect conflicts ------------------------------
    const toHandler = getClient(toType);
    let existingServers: Record<string, ServerEntry> = {};
    try {
      const targetConfig = await toHandler.readConfig();
      existingServers = targetConfig.servers;
    } catch {
      // Target config may not exist yet — that is fine
    }

    const toAdd = serverNames.filter((n) => !(n in existingServers));
    const toOverwrite = serverNames.filter((n) => n in existingServers);

    // --- Preview table -------------------------------------------------------
    console.log(pc.bold(`\n  Servers to migrate from ${fromLabel} to ${toLabel}:\n`));
    for (const name of toAdd) {
      console.log(`  ${pc.green("+")} ${name}  ${pc.dim("(new)")}`);
    }
    for (const name of toOverwrite) {
      console.log(`  ${pc.yellow("~")} ${name}  ${pc.yellow("(already exists — will overwrite)")}`);
    }
    console.log();

    if (args["dry-run"]) {
      p.outro(pc.dim("Dry run — no changes applied."));
      return;
    }

    // --- Confirm ------------------------------------------------------------
    if (!args.yes) {
      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`add ${toAdd.length}`);
      if (toOverwrite.length > 0) parts.push(`overwrite ${toOverwrite.length}`);
      const message = `${parts.join(" and ")} server(s) in ${toLabel}. Continue?`;

      const confirmed = await p.confirm({ message, initialValue: true });
      if (p.isCancel(confirmed) || !confirmed) {
        p.outro(pc.dim("Cancelled — no changes applied."));
        return;
      }
    }

    // --- Apply migration via target handler ---------------------------------
    const spinner = p.spinner();
    spinner.start("Migrating servers...");

    let successCount = 0;
    const errors: { name: string; error: string }[] = [];

    for (const [name, entry] of Object.entries(sourceServers)) {
      try {
        await toHandler.addServer(name, entry);
        successCount++;
      } catch (err) {
        errors.push({ name, error: String(err) });
      }
    }

    spinner.stop("Migration complete");

    if (errors.length > 0) {
      for (const e of errors) {
        p.log.error(`Failed to migrate "${e.name}": ${e.error}`);
      }
    }

    p.outro(
      errors.length === 0
        ? pc.green(`Migrated ${successCount} server(s) to ${toLabel}.`)
        : pc.yellow(
            `Migrated ${successCount}/${serverNames.length} server(s) — ${errors.length} error(s).`,
          ),
    );

    if (errors.length > 0) process.exit(1);
  },
});
