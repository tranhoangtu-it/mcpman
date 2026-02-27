import { spawn } from "node:child_process";
import type { CheckResult } from "./diagnostics.js";

/** Try to spawn the server process and check if it starts without immediate crash */
export async function checkProcessSpawn(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 3000,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve({ name: "Process", passed: true, message: "starts successfully (still running)" });
      }
    }, timeoutMs);

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ name: "Process", passed: false, message: `spawn error: ${err.message}` });
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (code === 0 || code === null) {
          resolve({ name: "Process", passed: true, message: "exits cleanly" });
        } else {
          resolve({ name: "Process", passed: false, message: `exits with code ${code}` });
        }
      }
    });
  });
}

const MCP_INIT_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcpman-doctor", version: "0.1.0" },
  },
});

/** Send MCP initialize JSON-RPC and check for valid response */
export async function checkMcpHandshake(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs = 5000,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const start = Date.now();
    let stdout = "";

    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const done = (result: CheckResult) => {
      if (!settled) {
        settled = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      done({ name: "MCP handshake", passed: false, message: "no response (timeout 5s)" });
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      done({ name: "MCP handshake", passed: false, message: `spawn error: ${err.message}` });
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed.jsonrpc === "2.0" && parsed.id === 1) {
            clearTimeout(timer);
            done({
              name: "MCP handshake",
              passed: true,
              message: `responds in ${Date.now() - start}ms`,
            });
            return;
          }
        } catch {
          /* not JSON yet */
        }
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        done({
          name: "MCP handshake",
          passed: false,
          message: `process exited with code ${code} before responding`,
        });
      }
    });

    child.stdin?.write(MCP_INIT_REQUEST + "\n");
  });
}
