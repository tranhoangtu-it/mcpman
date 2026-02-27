/**
 * run.ts
 * Spawn an installed MCP server process with vault secrets injected as env vars.
 * Env merge order (last wins): process.env < lockfile envVars < vault secrets < --env flags
 */

import { defineCommand } from "citty";
import { spawn } from "node:child_process";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import { parseEnvFlags } from "../core/server-resolver.js";
import {
  getMasterPassword,
  getSecretsForServer,
  listSecrets,
} from "../core/vault-service.js";

export default defineCommand({
  meta: {
    name: "run",
    description: "Run an installed MCP server with vault secrets injected",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to run (as installed in lockfile)",
      required: true,
    },
    env: {
      type: "string",
      description: "Override env var KEY=VAL (repeatable)",
      alias: "e",
    },
  },
  async run({ args }) {
    const serverName = args.server as string;

    // 1. Read lockfile and find the server entry
    const lockfile = readLockfile();
    const entry = lockfile.servers[serverName];

    if (!entry) {
      console.error(pc.red(`  Error: Server '${serverName}' is not installed.`));
      console.error(pc.dim(`  Run ${pc.cyan("mcpman install <server>")} to install it first.`));
      process.exit(1);
    }

    // 2. Parse lockfile envVars array (KEY=VAL format) into Record
    const lockfileEnv = parseEnvFlags(entry.envVars);

    // 3. Load vault secrets (skip gracefully if vault absent or no secrets)
    const vaultEnv = await loadVaultSecrets(serverName);

    // 4. Parse --env flag overrides (highest priority)
    const cliEnv = parseEnvFlags(args.env as string | string[] | undefined);

    // 5. Merge env: process.env < lockfile < vault < cli overrides
    const finalEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...lockfileEnv,
      ...vaultEnv,
      ...cliEnv,
    };

    // 6. Spawn the child process with stdio inherited
    console.log(pc.dim(`  Running ${pc.cyan(serverName)}...`));

    const child = spawn(entry.command, entry.args, {
      env: finalEnv,
      stdio: "inherit",
    });

    // 7. Forward signals to child process
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.on("SIGINT", () => forwardSignal("SIGINT"));
    process.on("SIGTERM", () => forwardSignal("SIGTERM"));

    // 8. Exit with child's exit code
    await new Promise<void>((resolve) => {
      child.on("close", (code) => {
        process.exit(code ?? 0);
        resolve();
      });

      child.on("error", (err) => {
        console.error(pc.red(`  Failed to start '${serverName}': ${err.message}`));
        process.exit(1);
        resolve();
      });
    });
  },
});

/**
 * Attempt to load vault secrets for a server.
 * Returns {} silently on any error (missing vault, no secrets, wrong password).
 * Only prompts for master password if the server has stored vault entries.
 */
async function loadVaultSecrets(serverName: string): Promise<Record<string, string>> {
  try {
    // Check for existing vault entries before prompting for password
    const entries = listSecrets(serverName);
    if (entries.length === 0 || entries[0].keys.length === 0) {
      return {};
    }

    const password = await getMasterPassword();
    return getSecretsForServer(serverName, password);
  } catch {
    // Warn but continue — vault secrets are optional
    console.warn(pc.yellow("  Warning: Could not load vault secrets, continuing without them."));
    return {};
  }
}
