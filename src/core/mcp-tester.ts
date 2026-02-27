/**
 * mcp-tester.ts
 * Validates MCP servers by spawning them and sending JSON-RPC requests.
 * Used by `mcpman test` command.
 */

import { spawn } from "node:child_process";

export interface McpTestResult {
  serverName: string;
  passed: boolean;
  initializeOk: boolean;
  toolsListOk: boolean;
  tools: string[];
  responseTimeMs: number;
  error?: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Test an MCP server by sending initialize + tools/list JSON-RPC requests.
 * Returns detailed result with pass/fail and discovered tools.
 */
export async function testMcpServer(
  serverName: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<McpTestResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let initOk = false;
    let toolsOk = false;
    let tools: string[] = [];

    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const done = (result: Partial<McpTestResult>) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve({
        serverName,
        passed: result.passed ?? false,
        initializeOk: result.initializeOk ?? initOk,
        toolsListOk: result.toolsListOk ?? toolsOk,
        tools: result.tools ?? tools,
        responseTimeMs: Date.now() - start,
        error: result.error,
      });
    };

    const timer = setTimeout(() => {
      done({ error: "Timeout: no response within 10s" });
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      done({ error: `Spawn error: ${err.message}` });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        done({ error: `Process exited with code ${code} before completing` });
      }
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      processLines();
    });

    function processLines() {
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if (msg.jsonrpc !== "2.0") continue;

          // Response to initialize (id=1)
          if (msg.id === 1 && !initOk) {
            initOk = true;
            // Send tools/list request
            const toolsReq = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            });
            child.stdin?.write(`${toolsReq}\n`);
          }

          // Response to tools/list (id=2)
          if (msg.id === 2 && initOk) {
            toolsOk = true;
            const result = msg.result as Record<string, unknown> | undefined;
            if (result && Array.isArray(result.tools)) {
              tools = (result.tools as Array<{ name?: string }>)
                .map((t) => t.name ?? "")
                .filter(Boolean);
            }
            clearTimeout(timer);
            done({ passed: true, initializeOk: true, toolsListOk: true, tools });
          }
        } catch {
          /* not JSON yet */
        }
      }
    }

    // Send initialize request
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcpman-test", version: "0.6.0" },
      },
    });
    child.stdin?.write(`${initReq}\n`);
  });
}
