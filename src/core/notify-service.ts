/**
 * notify-service.ts
 * Event webhook/shell hooks stored at ~/.mcpman/notify.json
 * Hooks: [{ event, type: "webhook"|"shell", target }]
 * Events: install, remove, update, health-fail
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import { getNotifyFile } from "../utils/paths.js";

export type HookEvent = "install" | "remove" | "update" | "health-fail";
export type HookType = "webhook" | "shell";

export interface NotifyHook {
  event: HookEvent;
  type: HookType;
  target: string;
}

export type NotifyPayload = Record<string, unknown>;

// ── I/O ───────────────────────────────────────────────────────────────────────

function readHooks(file?: string): NotifyHook[] {
  const target = file ?? getNotifyFile();
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf-8")) as unknown;
    return Array.isArray(parsed) ? (parsed as NotifyHook[]) : [];
  } catch {
    return [];
  }
}

function writeHooks(hooks: NotifyHook[], file?: string): void {
  const target = file ?? getNotifyFile();
  const dir = target.substring(0, target.lastIndexOf("/"));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, JSON.stringify(hooks, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add a new hook */
export function addHook(event: HookEvent, type: HookType, target: string, file?: string): void {
  const hooks = readHooks(file);
  hooks.push({ event, type, target });
  writeHooks(hooks, file);
}

/** Remove a hook by index */
export function removeHook(index: number, file?: string): void {
  const hooks = readHooks(file);
  if (index < 0 || index >= hooks.length) {
    throw new Error(`Hook index ${index} out of range (0–${hooks.length - 1})`);
  }
  hooks.splice(index, 1);
  writeHooks(hooks, file);
}

/** List all hooks */
export function listHooks(file?: string): NotifyHook[] {
  return readHooks(file);
}

/** Fire all hooks matching an event with the given payload */
export async function fireEvent(
  event: HookEvent,
  payload: NotifyPayload,
  file?: string,
): Promise<void> {
  const hooks = readHooks(file).filter((h) => h.event === event);
  if (hooks.length === 0) return;

  const body = JSON.stringify({ event, ...payload });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      if (hook.type === "webhook") {
        await fireWebhook(hook.target, body);
      } else {
        fireShell(hook.target, event, payload);
      }
    }),
  );
}

async function fireWebhook(url: string, body: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Webhook ${url} returned ${response.status}`);
  }
}

function fireShell(command: string, event: HookEvent, payload: NotifyPayload): void {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MCPMAN_EVENT: event,
    MCPMAN_PAYLOAD: JSON.stringify(payload),
  };
  execSync(command, { stdio: "inherit", env });
}
