/**
 * pin.ts
 * CLI command: `mcpman pin <server> [version]`
 * Pins a server to a specific version, preventing auto-update notifications.
 * Flags: --unpin, --list
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { readLockfile } from "../core/lockfile.js";
import {
  getPinnedVersion,
  isPinned,
  listPins,
  pinServer,
  unpinServer,
} from "../core/pin-service.js";

export default defineCommand({
  meta: {
    name: "pin",
    description: "Pin a server to a specific version",
  },
  args: {
    server: {
      type: "positional",
      description: "Server name to pin/unpin",
      required: false,
    },
    version: {
      type: "positional",
      description: "Version to pin to (defaults to currently installed version)",
      required: false,
    },
    unpin: {
      type: "boolean",
      description: "Remove the pin for a server",
      default: false,
    },
    list: {
      type: "boolean",
      description: "List all pinned servers",
      default: false,
    },
  },
  run({ args }) {
    // --list: show all pins
    if (args.list) {
      const pins = listPins();
      if (pins.length === 0) {
        console.log(pc.dim("No servers are pinned."));
        return;
      }
      console.log(`\n  ${pc.bold("Pinned servers")}\n`);
      for (const { server, version } of pins) {
        console.log(`  ${pc.cyan(pc.bold(server))}  ${pc.dim("@")}${pc.green(version)}`);
      }
      console.log("");
      return;
    }

    // --unpin: remove pin
    if (args.unpin) {
      if (!args.server) {
        console.error(`${pc.red("✗")} Specify a server name to unpin.`);
        process.exit(1);
      }
      if (!isPinned(args.server)) {
        console.log(pc.dim(`"${args.server}" is not pinned.`));
        return;
      }
      unpinServer(args.server);
      console.log(`${pc.green("✓")} Unpinned ${pc.cyan(args.server)}`);
      return;
    }

    // pin <server> [version]
    if (!args.server) {
      console.error(`${pc.red("✗")} Specify a server name to pin. Use --list to see pins.`);
      process.exit(1);
    }

    // Determine version: explicit arg or read from lockfile
    let version = args.version;
    if (!version) {
      const lockfile = readLockfile();
      version = lockfile.servers[args.server]?.version;
      if (!version) {
        console.error(
          `${pc.red("✗")} "${args.server}" not found in lockfile. Specify a version explicitly.`,
        );
        process.exit(1);
      }
    }

    pinServer(args.server, version);

    const prev = getPinnedVersion(args.server);
    if (prev && prev !== version) {
      console.log(
        `${pc.green("✓")} Re-pinned ${pc.cyan(args.server)} ${pc.dim(prev)} → ${pc.green(version)}`,
      );
    } else {
      console.log(`${pc.green("✓")} Pinned ${pc.cyan(args.server)} @ ${pc.green(version)}`);
    }
    console.log(pc.dim("  Update notifications will be suppressed for this server."));
  },
});
