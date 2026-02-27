/**
 * upgrade.ts
 * Self-update mcpman to the latest version from npm.
 */

import { execSync } from "node:child_process";
import { defineCommand } from "citty";
import pc from "picocolors";
import { APP_VERSION } from "../utils/constants.js";

export default defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade mcpman to the latest version",
  },
  args: {
    check: {
      type: "boolean",
      description: "Only check for updates, don't install",
      default: false,
    },
  },
  async run({ args }) {
    console.log(pc.dim(`  Current version: ${APP_VERSION}`));

    let latest: string;
    try {
      latest = execSync("npm view mcpman version", { encoding: "utf-8", timeout: 15_000 }).trim();
    } catch {
      console.error(pc.red("  Error: Could not check latest version from npm."));
      process.exit(1);
    }

    if (latest === APP_VERSION) {
      console.log(pc.green("  ✓ Already on the latest version."));
      return;
    }

    console.log(pc.yellow(`  Update available: ${APP_VERSION} → ${latest}`));

    if (args.check) {
      console.log(pc.dim("  Run mcpman upgrade to install."));
      return;
    }

    console.log(pc.dim("  Installing..."));
    try {
      execSync(`npm install -g mcpman@${latest}`, { stdio: "inherit", timeout: 60_000 });
      console.log(pc.green(`\n  ✓ Upgraded to mcpman@${latest}`));
    } catch {
      console.error(pc.red("  Error: Upgrade failed. Try manually: npm install -g mcpman@latest"));
      process.exit(1);
    }
  },
});
