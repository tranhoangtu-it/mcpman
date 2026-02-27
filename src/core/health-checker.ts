import type { ServerEntry } from "../clients/types.js";
import {
  checkEnvVars,
  checkMcpHandshake,
  checkProcessSpawn,
  checkRuntime,
  type CheckResult,
} from "./diagnostics.js";

export type HealthStatus = "healthy" | "unhealthy" | "unknown";

export interface HealthResult {
  serverName: string;
  status: HealthStatus;
  checks: CheckResult[];
}

/**
 * Run all 4 health checks for a server and return detailed results.
 * Checks: runtime → process spawn → MCP handshake → env vars
 */
export async function checkServerHealth(
  name: string,
  config: ServerEntry
): Promise<HealthResult> {
  const checks: CheckResult[] = [];

  // 1. Runtime check
  const runtimeCheck = await checkRuntime(config.command);
  checks.push(runtimeCheck);

  // 2. Process spawn check (skip if runtime missing)
  if (!runtimeCheck.passed) {
    checks.push({ name: "Process", passed: false, skipped: true, message: "skipped (runtime missing)" });
    checks.push({ name: "MCP handshake", passed: false, skipped: true, message: "skipped (runtime missing)" });
  } else {
    const spawnCheck = await checkProcessSpawn(
      config.command,
      config.args ?? [],
      config.env ?? {}
    );
    checks.push(spawnCheck);

    // 3. MCP handshake (skip if process can't spawn)
    if (!spawnCheck.passed) {
      checks.push({ name: "MCP handshake", passed: false, skipped: true, message: "skipped (process failed)" });
    } else {
      const handshakeCheck = await checkMcpHandshake(
        config.command,
        config.args ?? [],
        config.env ?? {}
      );
      checks.push(handshakeCheck);
    }
  }

  // 4. Env vars check (always runs)
  checks.push(checkEnvVars(config.env));

  // Determine overall status
  const failed = checks.filter((c) => !c.skipped && !c.passed);
  const status: HealthStatus = failed.length === 0 ? "healthy" : "unhealthy";

  return { serverName: name, status, checks };
}

/**
 * Lightweight health probe for use in `mcpman list`.
 * Only spawns + sends MCP initialize, times out after timeoutMs (default 3s).
 * Returns HealthStatus without detailed check breakdown.
 */
export async function quickHealthProbe(
  config: ServerEntry,
  timeoutMs = 3000
): Promise<HealthStatus> {
  try {
    const runtimeCheck = await checkRuntime(config.command);
    if (!runtimeCheck.passed) return "unhealthy";

    const handshake = await checkMcpHandshake(
      config.command,
      config.args ?? [],
      config.env ?? {},
      timeoutMs
    );
    return handshake.passed ? "healthy" : "unhealthy";
  } catch {
    return "unknown";
  }
}
