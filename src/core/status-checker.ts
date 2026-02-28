/**
 * status-checker.ts
 * Live process health snapshot for installed MCP servers.
 * For each server in lockfile, attempts a JSON-RPC initialize handshake
 * with a 3-second timeout, and reports alive/dead + response time.
 */

import { execSync } from "node:child_process";
import { spawn } from "node:child_process";
import { readLockfile } from "./lockfile.js";
import type { LockEntry } from "./lockfile.js";

export interface ServerStatus {
  name: string;
  alive: boolean;
  responseTimeMs: number | null;
  error?: string;
}

const MCP_INIT_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcpman-status", version: "0.9.0" },
  },
});

/** Check if process for given command is running via ps aux */
export function isProcessRunning(command: string): boolean {
  try {
    const out = execSync("ps aux", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    // Match on the binary name (last segment of path)
    const bin = command.split("/").pop() ?? command;
    return out.includes(bin);
  } catch {
    return false;
  }
}

/** Probe a single MCP server by spawning it and sending JSON-RPC initialize */
export async function probeServer(
  name: string,
  entry: LockEntry,
  timeoutMs = 3000,
): Promise<ServerStatus> {
  const start = Date.now();

  return new Promise((resolve) => {
    let settled = false;

    const settle = (status: ServerStatus) => {
      if (!settled) {
        settled = true;
        resolve(status);
      }
    };

    let child: ReturnType<typeof spawn> | null = null;

    const timer = setTimeout(() => {
      child?.kill();
      settle({
        name,
        alive: false,
        responseTimeMs: null,
        error: "timeout",
      });
    }, timeoutMs);

    try {
      child = spawn(entry.command, entry.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (err) {
      clearTimeout(timer);
      settle({
        name,
        alive: false,
        responseTimeMs: null,
        error: String(err),
      });
      return;
    }

    let stdout = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // Look for a JSON-RPC response line
      const lines = stdout.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed.jsonrpc === "2.0" && "result" in parsed) {
            clearTimeout(timer);
            child?.kill();
            settle({
              name,
              alive: true,
              responseTimeMs: Date.now() - start,
            });
            return;
          }
        } catch {
          // not JSON — keep reading
        }
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      settle({
        name,
        alive: false,
        responseTimeMs: null,
        error: err.message,
      });
    });

    child.on("exit", (code) => {
      if (!settled) {
        clearTimeout(timer);
        settle({
          name,
          alive: false,
          responseTimeMs: null,
          error: `exited with code ${code}`,
        });
      }
    });

    // Send the initialize request
    try {
      child.stdin?.write(`${MCP_INIT_REQUEST}\n`);
    } catch {
      // ignore write errors — exit handler will cover it
    }
  });
}

/** Get live status for all (or one) servers from the lockfile */
export async function getServerStatuses(serverName?: string): Promise<ServerStatus[]> {
  const lockfile = readLockfile();
  const { servers } = lockfile;

  if (serverName) {
    const entry = servers[serverName];
    if (!entry) {
      return [{ name: serverName, alive: false, responseTimeMs: null, error: "not in lockfile" }];
    }
    return [await probeServer(serverName, entry)];
  }

  if (Object.keys(servers).length === 0) return [];

  return Promise.all(Object.entries(servers).map(([name, entry]) => probeServer(name, entry)));
}
