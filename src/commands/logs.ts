/**
 * logs.ts
 * Spawn an MCP server and stream its stdout/stderr to the terminal.
 * Reuses vault secrets injection pattern from run.ts.
 */

import { spawn } from "node:child_process";
import { defineCommand } from "citty";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import { parseEnvFlags } from "../core/server-resolver.js";
import { getMasterPassword, getSecretsForServer, listSecrets } from "../core/vault-service.js";

export default defineCommand({
  meta: {
    name: "logs",
    description: "Stream stdout/stderr from an MCP server",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to stream logs from",
      required: true,
    },
    follow: {
      type: "boolean",
      description: "Keep streaming (default: true, Ctrl+C to stop)",
      alias: "f",
      default: true,
    },
  },
  async run({ args }) {
    const serverName = args.server as string;
    const lockfile = readLockfile();
    const entry = lockfile.servers[serverName];

    if (!entry) {
      console.error(pc.red(`  Error: Server '${serverName}' is not installed.`));
      process.exit(1);
    }

    // Build env: process.env < lockfile < vault
    const lockfileEnv = parseEnvFlags(entry.envVars);
    const vaultEnv = await loadVaultSecrets(serverName);
    const finalEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...lockfileEnv,
      ...vaultEnv,
    };

    console.log(pc.dim(`  Streaming logs for ${pc.cyan(serverName)}... (Ctrl+C to stop)\n`));

    const child = spawn(entry.command, entry.args, {
      env: finalEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(pc.dim("[stdout] ") + chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(pc.yellow("[stderr] ") + chunk.toString());
    });

    child.on("error", (err) => {
      console.error(pc.red(`  Failed to start '${serverName}': ${err.message}`));
      process.exit(1);
    });

    child.on("close", (code) => {
      console.log(pc.dim(`\n  Process exited with code ${code ?? 0}`));
      process.exit(code ?? 0);
    });

    // Forward SIGINT/SIGTERM to child
    const forward = (sig: NodeJS.Signals) => {
      if (!child.killed) child.kill(sig);
    };
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));

    // Keep process alive
    await new Promise(() => {});
  },
});

async function loadVaultSecrets(serverName: string): Promise<Record<string, string>> {
  try {
    const entries = listSecrets(serverName);
    if (entries.length === 0 || entries[0].keys.length === 0) return {};
    const password = await getMasterPassword();
    return getSecretsForServer(serverName, password);
  } catch {
    return {};
  }
}
