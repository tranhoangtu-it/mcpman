/**
 * watch.ts
 * Watch a local MCP server's source files for changes and auto-restart.
 * Like nodemon but built into mcpman. Reuses vault secret loading from run.ts.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { ServerWatcher } from "../core/file-watcher-service.js";
import { readLockfile } from "../core/lockfile.js";
import { parseEnvFlags } from "../core/server-resolver.js";
import { getMasterPassword, getSecretsForServer, listSecrets } from "../core/vault-service.js";

const DEFAULT_EXTENSIONS = ["ts", "js", "json", "py", "mjs", "cjs"];
const DEFAULT_DEBOUNCE_MS = 300;

export default defineCommand({
  meta: {
    name: "watch",
    description: "Watch a local MCP server for file changes and auto-restart",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name (must be in lockfile)",
      required: true,
    },
    dir: {
      type: "string",
      description: "Directory to watch (default: resolved path from lockfile)",
    },
    ext: {
      type: "string",
      description: `File extensions to watch, comma-separated (default: ${DEFAULT_EXTENSIONS.join(",")})`,
    },
    delay: {
      type: "string",
      description: `Debounce delay in ms (default: ${DEFAULT_DEBOUNCE_MS})`,
    },
    clear: {
      type: "boolean",
      description: "Clear terminal on each restart",
      default: false,
    },
    env: {
      type: "string",
      description: "Override env var KEY=VAL (repeatable)",
      alias: "e",
    },
  },
  async run({ args }) {
    const serverName = args.server as string;

    // Validate server exists in lockfile
    const lockfile = readLockfile();
    const entry = lockfile.servers[serverName];
    if (!entry) {
      console.error(pc.red(`  Error: Server '${serverName}' not found in lockfile.`));
      console.error(pc.dim(`  Run ${pc.cyan("mcpman link .")} to register a local server.`));
      process.exit(1);
    }

    // Determine watch directory
    let watchDir = args.dir as string | undefined;
    if (!watchDir) {
      if (entry.source === "local" && entry.resolved) {
        watchDir = entry.resolved;
      } else {
        console.error(pc.red(`  Error: Cannot determine watch directory for '${serverName}'.`));
        console.error(pc.dim("  Use --dir to specify the directory to watch."));
        process.exit(1);
      }
    }

    // Parse options
    const extensions = (args.ext as string | undefined)
      ? (args.ext as string).split(",").map((e) => e.trim().replace(/^\./, ""))
      : DEFAULT_EXTENSIONS;

    const debounceMs = args.delay
      ? Number.parseInt(args.delay as string, 10) || DEFAULT_DEBOUNCE_MS
      : DEFAULT_DEBOUNCE_MS;

    // Build env: process.env < lockfile envVars < vault < cli flags
    const lockfileEnv = parseEnvFlags(entry.envVars);
    const vaultEnv = await loadVaultSecrets(serverName);
    const cliEnv = parseEnvFlags(args.env as string | string[] | undefined);

    const finalEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...lockfileEnv,
      ...vaultEnv,
      ...cliEnv,
    };

    // Start watcher
    const watcher = new ServerWatcher();

    const handleStop = () => {
      watcher.stop();
      process.exit(0);
    };

    process.on("SIGINT", handleStop);
    process.on("SIGTERM", handleStop);

    watcher.start({
      command: entry.command,
      args: entry.args,
      env: finalEnv,
      watchDir,
      extensions,
      debounceMs,
      clearOnRestart: args.clear as boolean,
      serverName,
    });
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
