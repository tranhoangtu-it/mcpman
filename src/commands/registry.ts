/**
 * registry.ts
 * CRUD command for managing custom registry URLs.
 * Sub-commands: list, add, remove, set-default
 * Built-in registries (npm, smithery) are always present and cannot be removed.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import {
  addRegistry,
  getDefaultRegistry,
  getRegistries,
  removeRegistry,
  setDefaultRegistry,
} from "../core/registry-manager.js";

export default defineCommand({
  meta: {
    name: "registry",
    description: "Manage custom registry URLs",
  },
  args: {
    action: {
      type: "positional",
      description: "Action: list, add, remove, set-default",
      required: true,
    },
    name: {
      type: "positional",
      description: "Registry name (for add/remove/set-default)",
      required: false,
    },
    url: {
      type: "positional",
      description: "Registry URL (for add)",
      required: false,
    },
  },
  async run({ args }) {
    const action = (args.action as string).toLowerCase();
    const name = args.name as string | undefined;
    const url = args.url as string | undefined;

    switch (action) {
      case "list": {
        const registries = getRegistries();
        const defaultName = getDefaultRegistry();

        console.log(pc.bold("\n  Registries\n"));
        for (const r of registries) {
          const isDefault = r.name === defaultName;
          const defaultTag = isDefault ? pc.green(" (default)") : "";
          const builtinTag = r.builtin ? pc.dim(" [builtin]") : "";
          console.log(
            `  ${isDefault ? pc.green("●") : pc.dim("○")} ${pc.bold(r.name)}${defaultTag}${builtinTag}`,
          );
          console.log(`    ${pc.dim(r.url)}`);
        }
        console.log();
        break;
      }

      case "add": {
        if (!name) {
          console.error(pc.red("  Error: Usage: mcpman registry add <name> <url>"));
          process.exit(1);
        }
        if (!url) {
          console.error(pc.red("  Error: Usage: mcpman registry add <name> <url>"));
          process.exit(1);
        }
        try {
          addRegistry(name, url);
          console.log(pc.green(`  Added registry '${name}' → ${url}`));
        } catch (err) {
          console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
          process.exit(1);
        }
        break;
      }

      case "remove": {
        if (!name) {
          console.error(pc.red("  Error: Usage: mcpman registry remove <name>"));
          process.exit(1);
        }
        try {
          removeRegistry(name);
          console.log(pc.green(`  Removed registry '${name}'.`));
        } catch (err) {
          console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
          process.exit(1);
        }
        break;
      }

      case "set-default": {
        if (!name) {
          console.error(pc.red("  Error: Usage: mcpman registry set-default <name>"));
          process.exit(1);
        }
        try {
          setDefaultRegistry(name);
          console.log(pc.green(`  Default registry set to '${name}'.`));
        } catch (err) {
          console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
          process.exit(1);
        }
        break;
      }

      default:
        console.error(pc.red(`  Unknown action '${action}'. Use: list, add, remove, set-default.`));
        process.exit(1);
    }
  },
});
