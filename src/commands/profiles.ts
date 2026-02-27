/**
 * profiles.ts
 * Manage named server configuration profiles.
 * Sub-commands: create, switch, list, delete
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { writeLockfile } from "../core/lockfile.js";
import type { LockfileData } from "../core/lockfile.js";
import {
  createProfile,
  deleteProfile,
  listProfiles,
  loadProfile,
} from "../core/profile-service.js";

export default defineCommand({
  meta: {
    name: "profiles",
    description: "Manage named server configuration profiles",
  },
  args: {
    action: {
      type: "positional",
      description: "Action: create, switch, list, or delete",
      required: true,
    },
    name: {
      type: "positional",
      description: "Profile name (required for create/switch/delete)",
      required: false,
    },
    description: {
      type: "string",
      description: "Profile description (for create)",
      alias: "d",
    },
  },
  async run({ args }) {
    const action = (args.action as string).toLowerCase();
    const name = args.name as string | undefined;

    switch (action) {
      case "create": {
        if (!name) {
          console.error(
            pc.red("  Error: Profile name required. Usage: mcpman profiles create <name>"),
          );
          process.exit(1);
        }
        try {
          const profile = createProfile(name, (args.description as string) ?? "");
          const count = Object.keys(profile.servers).length;
          console.log(pc.green(`  ✓ Profile '${name}' created with ${count} server(s).`));
        } catch (err) {
          console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
          process.exit(1);
        }
        break;
      }

      case "switch": {
        if (!name) {
          console.error(
            pc.red("  Error: Profile name required. Usage: mcpman profiles switch <name>"),
          );
          process.exit(1);
        }
        const profile = loadProfile(name);
        if (!profile) {
          console.error(pc.red(`  Error: Profile '${name}' not found.`));
          process.exit(1);
        }
        const lockData: LockfileData = { lockfileVersion: 1, servers: profile.servers };
        writeLockfile(lockData);
        const count = Object.keys(profile.servers).length;
        console.log(pc.green(`  ✓ Switched to profile '${name}' (${count} servers).`));
        console.log(pc.dim("  Run mcpman sync to apply to all clients."));
        break;
      }

      case "list": {
        const profiles = listProfiles();
        if (profiles.length === 0) {
          console.log(
            pc.dim("  No profiles saved. Create one with: mcpman profiles create <name>"),
          );
          return;
        }
        console.log(pc.bold(`\n  Profiles (${profiles.length})\n`));
        for (const p of profiles) {
          const count = Object.keys(p.servers).length;
          const desc = p.description ? pc.dim(` — ${p.description}`) : "";
          console.log(
            `  ${pc.cyan("●")} ${pc.bold(p.name)}  ${pc.dim(`${count} server(s)`)}${desc}`,
          );
        }
        console.log();
        break;
      }

      case "delete": {
        if (!name) {
          console.error(
            pc.red("  Error: Profile name required. Usage: mcpman profiles delete <name>"),
          );
          process.exit(1);
        }
        const deleted = deleteProfile(name);
        if (deleted) {
          console.log(pc.green(`  ✓ Profile '${name}' deleted.`));
        } else {
          console.error(pc.red(`  Error: Profile '${name}' not found.`));
          process.exit(1);
        }
        break;
      }

      default:
        console.error(
          pc.red(`  Unknown action '${action}'. Use: create, switch, list, or delete.`),
        );
        process.exit(1);
    }
  },
});
