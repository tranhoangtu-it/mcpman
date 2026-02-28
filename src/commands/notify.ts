/**
 * notify.ts
 * `mcpman notify` — manage event webhook/shell hooks.
 * Sub-actions: add, remove, list, test
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { addHook, fireEvent, listHooks, removeHook } from "../core/notify-service.js";
import type { HookEvent, HookType } from "../core/notify-service.js";

const VALID_EVENTS: HookEvent[] = ["install", "remove", "update", "health-fail"];

// ── Sub-commands ──────────────────────────────────────────────────────────────

const addCmd = defineCommand({
  meta: { name: "add", description: "Add a webhook or shell hook for an event" },
  args: {
    event: {
      type: "string",
      description: `Event to hook (${VALID_EVENTS.join(", ")})`,
      required: true,
    },
    webhook: {
      type: "string",
      description: "Webhook URL (POST JSON payload)",
    },
    shell: {
      type: "string",
      description: "Shell command to run",
    },
  },
  run({ args }) {
    const event = args.event as HookEvent;
    if (!VALID_EVENTS.includes(event)) {
      console.error(`${pc.red("✗")} Invalid event "${event}". Valid: ${VALID_EVENTS.join(", ")}`);
      process.exit(1);
    }

    if (!args.webhook && !args.shell) {
      console.error(`${pc.red("✗")} Provide --webhook <url> or --shell <command>`);
      process.exit(1);
    }

    const type: HookType = args.webhook ? "webhook" : "shell";
    const target = (args.webhook ?? args.shell) as string;

    addHook(event, type, target);
    const hooks = listHooks();
    const idx = hooks.length - 1;
    console.log(
      `${pc.green("✓")} Hook [${pc.cyan(String(idx))}] added: ${pc.bold(event)} → ${pc.dim(type)}:${target}`,
    );
  },
});

const removeCmd = defineCommand({
  meta: { name: "remove", description: "Remove a hook by index" },
  args: {
    index: { type: "positional", description: "Hook index (from `notify list`)", required: true },
  },
  run({ args }) {
    const idx = Number(args.index);
    if (Number.isNaN(idx) || idx < 0) {
      console.error(`${pc.red("✗")} Invalid index "${args.index}".`);
      process.exit(1);
    }
    try {
      removeHook(idx);
      console.log(`${pc.green("✓")} Hook [${idx}] removed`);
    } catch (err) {
      console.error(`${pc.red("✗")} ${String(err)}`);
      process.exit(1);
    }
  },
});

const listCmd = defineCommand({
  meta: { name: "list", description: "List all configured hooks" },
  args: {},
  run() {
    const hooks = listHooks();
    if (hooks.length === 0) {
      console.log(
        pc.dim(
          "\n  No hooks configured. Use `mcpman notify add --event <event> --webhook <url>`.\n",
        ),
      );
      return;
    }
    console.log(pc.bold("\n  mcpman notify hooks\n"));
    console.log(pc.dim(`  ${"─".repeat(60)}`));
    hooks.forEach((h, i) => {
      const typeLabel = h.type === "webhook" ? pc.blue("webhook") : pc.magenta("shell");
      console.log(
        `  ${pc.dim(`[${i}]`)}  ${pc.bold(h.event.padEnd(12))}  ${typeLabel}  ${pc.dim(h.target)}`,
      );
    });
    console.log(pc.dim(`  ${"─".repeat(60)}\n`));
  },
});

const testCmd = defineCommand({
  meta: { name: "test", description: "Fire a test event to all matching hooks" },
  args: {
    event: {
      type: "positional",
      description: `Event to test (${VALID_EVENTS.join(", ")})`,
      required: true,
    },
  },
  async run({ args }) {
    const event = args.event as HookEvent;
    if (!VALID_EVENTS.includes(event)) {
      console.error(`${pc.red("✗")} Invalid event "${event}". Valid: ${VALID_EVENTS.join(", ")}`);
      process.exit(1);
    }

    const hooks = listHooks().filter((h) => h.event === event);
    if (hooks.length === 0) {
      console.log(pc.dim(`\n  No hooks configured for event "${event}".\n`));
      return;
    }

    console.log(pc.cyan(`\n  Firing test event: ${pc.bold(event)} (${hooks.length} hook(s))...\n`));

    try {
      await fireEvent(event, { test: true, timestamp: new Date().toISOString() });
      console.log(`${pc.green("✓")} Test event fired\n`);
    } catch (err) {
      console.error(`${pc.red("✗")} ${String(err)}`);
      process.exit(1);
    }
  },
});

// ── Main command ──────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "notify",
    description: "Manage event webhooks and shell hooks",
  },
  subCommands: {
    add: addCmd,
    remove: removeCmd,
    list: listCmd,
    test: testCmd,
  },
});
