/**
 * history-service.ts
 * Ring buffer of 50 CLI commands at ~/.mcpman/history.json
 * Each entry: { command, timestamp, args }
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import { getHistoryFile } from "../utils/paths.js";

export interface HistoryEntry {
  command: string;
  timestamp: string;
  args: string[];
}

const MAX_HISTORY = 50;

// ── I/O ───────────────────────────────────────────────────────────────────────

function readHistory(file?: string): HistoryEntry[] {
  const target = file ?? getHistoryFile();
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf-8")) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[], file?: string): void {
  const target = file ?? getHistoryFile();
  const dir = target.substring(0, target.lastIndexOf("/"));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(target, JSON.stringify(entries, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Append a command to history (ring buffer of MAX_HISTORY) */
export function recordCommand(argv: string[], file?: string): void {
  const [command, ...args] = argv;
  const entry: HistoryEntry = {
    command: command ?? "",
    timestamp: new Date().toISOString(),
    args,
  };
  const history = readHistory(file);
  history.push(entry);
  // Keep only the last MAX_HISTORY entries
  const trimmed = history.slice(-MAX_HISTORY);
  writeHistory(trimmed, file);
}

/** Get all history entries (oldest first) */
export function getHistory(file?: string): HistoryEntry[] {
  return readHistory(file);
}

/** Replay a command by index (0 = most recent) */
export function replayCommand(index: number, file?: string): void {
  const history = readHistory(file);
  if (history.length === 0) {
    throw new Error("History is empty");
  }

  // index 0 = most recent (last element)
  const reversed = [...history].reverse();
  if (index < 0 || index >= reversed.length) {
    throw new Error(`Index ${index} out of range (0–${reversed.length - 1})`);
  }

  const entry = reversed[index];
  const fullCommand = ["mcpman", entry.command, ...entry.args].filter(Boolean).join(" ");
  execSync(fullCommand, { stdio: "inherit" });
}

/** Clear all history */
export function clearHistory(file?: string): void {
  writeHistory([], file);
}
