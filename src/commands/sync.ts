/**
 * sync.ts
 * `mcpman sync` — detect drift between lockfile and client configs, show diff table, apply fixes.
 *
 * Flags:
 *   --dry-run   Preview only, do not write
 *   --remove    Remove servers in clients that are not in the lockfile
 *   --source    Use a specific client as source of truth instead of lockfile
 *   --yes       Skip confirmation prompt
 */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import { computeDiff, computeDiffFromClient } from "../core/config-diff.js";
import { applySyncActions, getClientConfigs } from "../core/sync-engine.js";
import type { ClientType } from "../clients/types.js";
import type { SyncAction } from "../core/config-diff.js";

const VALID_CLIENTS: ClientType[] = ["claude-desktop", "cursor", "vscode", "windsurf"];

const CLIENT_DISPLAY: Record<ClientType, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

export default defineCommand({
  meta: {
    name: "sync",
    description: "Sync MCP server configs across all detected AI clients",
  },
  args: {
    "dry-run": {
      type: "boolean",
      description: "Preview changes without applying them",
      default: false,
    },
    remove: {
      type: "boolean",
      description: "Remove extra servers not in lockfile",
      default: false,
    },
    source: {
      type: "string",
      description: "Use a specific client as source of truth (claude-desktop, cursor, vscode, windsurf)",
    },
    yes: {
      type: "boolean",
      description: "Skip confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    p.intro(`${pc.cyan("mcpman sync")}`);

    // Validate --source flag if provided
    const sourceClient = args.source as ClientType | undefined;
    if (sourceClient && !VALID_CLIENTS.includes(sourceClient)) {
      p.log.error(`Invalid --source "${sourceClient}". Must be one of: ${VALID_CLIENTS.join(", ")}`);
      process.exit(1);
    }

    // Read client configs
    const spinner = p.spinner();
    spinner.start("Detecting clients and reading configs...");
    const { configs, handlers } = await getClientConfigs();
    spinner.stop(`Found ${configs.size} client(s)`);

    if (configs.size === 0) {
      p.log.warn("No AI clients detected. Install Claude Desktop, Cursor, VS Code, or Windsurf first.");
      process.exit(0);
    }

    // Compute diff
    const diffOptions = { remove: args.remove };
    let actions: SyncAction[];
    if (sourceClient) {
      if (!configs.has(sourceClient)) {
        p.log.error(`Source client "${sourceClient}" is not detected or its config is unreadable.`);
        process.exit(1);
      }
      p.log.info(`Using ${CLIENT_DISPLAY[sourceClient]} as source of truth`);
      actions = computeDiffFromClient(sourceClient, configs, diffOptions);
    } else {
      const lockfile = readLockfile();
      actions = computeDiff(lockfile, configs, diffOptions);
    }

    // Display diff table
    printDiffTable(actions);

    const addCount = actions.filter((a) => a.action === "add").length;
    const extraCount = actions.filter((a) => a.action === "extra").length;
    const removeCount = actions.filter((a) => a.action === "remove").length;

    if (addCount === 0 && removeCount === 0 && extraCount === 0) {
      p.outro(pc.green("All clients are in sync."));
      process.exit(0);
    }

    // Summary line
    const parts: string[] = [];
    if (addCount > 0) parts.push(pc.green(`${addCount} to add`));
    if (removeCount > 0) parts.push(pc.red(`${removeCount} to remove`));
    if (extraCount > 0) parts.push(pc.yellow(`${extraCount} extra (informational)`));
    p.log.info(parts.join("  ·  "));

    if (args["dry-run"]) {
      p.outro(pc.dim("Dry run — no changes applied."));
      process.exit(1);
    }

    if (addCount === 0 && removeCount === 0) {
      p.outro(pc.dim("No additions needed. Extra servers left untouched."));
      process.exit(1);
    }

    // Confirm before applying
    if (!args.yes) {
      const actionParts: string[] = [];
      if (addCount > 0) actionParts.push(`${addCount} addition(s)`);
      if (removeCount > 0) actionParts.push(`${removeCount} removal(s)`);
      const confirmed = await p.confirm({
        message: `Apply ${actionParts.join(" and ")} to client configs?`,
        initialValue: true,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.outro(pc.dim("Cancelled — no changes applied."));
        process.exit(0);
      }
    }

    // Apply changes
    spinner.start("Applying sync changes...");
    const result = await applySyncActions(actions, handlers);
    spinner.stop("Done");

    if (result.applied > 0) {
      p.log.success(`Added ${result.applied} server(s) to client configs.`);
    }
    if (result.removed > 0) {
      p.log.success(`Removed ${result.removed} server(s) from client configs.`);
    }
    if (result.failed > 0) {
      for (const e of result.errors) {
        p.log.error(`Failed to sync "${e.server}" on ${e.client}: ${e.error}`);
      }
    }

    p.outro(result.failed === 0 ? pc.green("Sync complete.") : pc.yellow("Sync complete with errors."));
    process.exit(result.failed > 0 ? 1 : 0);
  },
});

// ---- Helpers ----------------------------------------------------------------

function printDiffTable(actions: SyncAction[]): void {
  if (actions.length === 0) {
    p.log.info("No actions to display.");
    return;
  }

  const nameWidth = Math.max(6, ...actions.map((a) => a.server.length));
  const clientWidth = Math.max(6, ...actions.map((a) => CLIENT_DISPLAY[a.client]?.length ?? a.client.length));

  const header = `  ${pad("SERVER", nameWidth)}  ${pad("CLIENT", clientWidth)}  STATUS`;
  console.log(pc.dim(header));
  console.log(pc.dim(`  ${"-".repeat(nameWidth)}  ${"-".repeat(clientWidth)}  ------`));

  for (const action of actions) {
    const clientDisplay = CLIENT_DISPLAY[action.client] ?? action.client;
    const [icon, statusText] = formatAction(action.action);
    console.log(`  ${pad(action.server, nameWidth)}  ${pad(clientDisplay, clientWidth)}  ${icon} ${statusText}`);
  }
  console.log("");
}

function formatAction(action: "add" | "extra" | "remove" | "ok"): [string, string] {
  switch (action) {
    case "add":    return [pc.green("+"), pc.green("missing — will add")];
    case "extra":  return [pc.yellow("?"), pc.yellow("extra (not in lockfile)")];
    case "remove": return [pc.red("–"), pc.red("extra — will remove")];
    case "ok":     return [pc.dim("·"), pc.dim("in sync")];
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
