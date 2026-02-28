/**
 * bench-service.ts
 * MCP server latency benchmark via JSON-RPC initialize over stdio.
 * Reuses spawn pattern from mcp-tester.ts.
 */

import { spawn } from "node:child_process";

export interface BenchResult {
  runs: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  allTimes: number[];
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Send a single JSON-RPC initialize to the server and return latency in ms.
 * Resolves with elapsed ms on success, rejects on error/timeout.
 */
function measureOneRun(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    let stdout = "";

    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(Date.now() - start);
    };

    const timer = setTimeout(() => {
      finish(new Error("Timeout waiting for initialize response"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      finish(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) finish(new Error(`Process exited with code ${code}`));
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if (msg.jsonrpc === "2.0" && msg.id === 1) {
            clearTimeout(timer);
            finish();
          }
        } catch {
          /* partial JSON */
        }
      }
    });

    // Send initialize request
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcpman-bench", version: "0.8.0" },
      },
    });
    child.stdin?.write(`${initReq}\n`);
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Run N latency measurements against an MCP server.
 * Returns stats: min, max, avg, p50, p95.
 */
export async function benchServer(
  command: string,
  args: string[],
  env: Record<string, string>,
  runs = 5,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BenchResult> {
  const allTimes: number[] = [];

  for (let i = 0; i < runs; i++) {
    try {
      const ms = await measureOneRun(command, args, env, timeoutMs);
      allTimes.push(ms);
    } catch (err) {
      return {
        runs,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        allTimes,
        error: String(err instanceof Error ? err.message : err),
      };
    }
  }

  const sorted = [...allTimes].sort((a, b) => a - b);
  const sum = allTimes.reduce((a, b) => a + b, 0);

  return {
    runs,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: Math.round(sum / allTimes.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    allTimes,
  };
}
