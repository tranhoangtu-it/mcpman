/**
 * test-command.ts
 * Validate MCP servers by sending JSON-RPC initialize + tools/list.
 * Named test-command.ts to avoid conflict with test runner.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import { testMcpServer } from "../core/mcp-tester.js";
import { parseEnvFlags } from "../core/server-resolver.js";
import { getMasterPassword, getSecretsForServer, listSecrets } from "../core/vault-service.js";

export default defineCommand({
  meta: {
    name: "test",
    description: "Test MCP server connectivity and capabilities",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to test (or omit with --all)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "Test all installed servers",
      default: false,
    },
  },
  async run({ args }) {
    const lockfile = readLockfile();
    const serverNames = args.all
      ? Object.keys(lockfile.servers)
      : args.server
        ? [args.server as string]
        : [];

    if (serverNames.length === 0) {
      console.error(pc.red("  Error: Specify a server name or use --all."));
      process.exit(1);
    }

    console.log(pc.bold(`\n  mcpman test — ${serverNames.length} server(s)\n`));

    let passed = 0;
    let failed = 0;

    for (const name of serverNames) {
      const entry = lockfile.servers[name];
      if (!entry) {
        console.log(`  ${pc.red("✗")} ${pc.bold(name)} — not installed`);
        failed++;
        continue;
      }

      // Build env with vault secrets
      const lockEnv = parseEnvFlags(entry.envVars);
      const vaultEnv = await loadVaultSecrets(name);
      const env = { ...lockEnv, ...vaultEnv };

      const result = await testMcpServer(name, entry.command, entry.args, env);

      if (result.passed) {
        passed++;
        console.log(
          `  ${pc.green("✓")} ${pc.bold(name)} ${pc.dim(`(${result.responseTimeMs}ms)`)}`,
        );
        if (result.tools.length > 0) {
          console.log(pc.dim(`    Tools: ${result.tools.join(", ")}`));
        }
      } else {
        failed++;
        console.log(`  ${pc.red("✗")} ${pc.bold(name)} ${pc.dim(`(${result.responseTimeMs}ms)`)}`);
        if (result.error) {
          console.log(`    ${pc.red(result.error)}`);
        }
        console.log(
          `    ${pc.dim("initialize:")} ${result.initializeOk ? pc.green("ok") : pc.red("fail")}  ${pc.dim("tools/list:")} ${result.toolsListOk ? pc.green("ok") : pc.red("fail")}`,
        );
      }
    }

    console.log(pc.dim(`\n  ${"─".repeat(40)}`));
    const parts: string[] = [];
    if (passed > 0) parts.push(pc.green(`${passed} passed`));
    if (failed > 0) parts.push(pc.red(`${failed} failed`));
    console.log(`  ${parts.join(", ")}\n`);

    if (failed > 0) process.exit(1);
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
