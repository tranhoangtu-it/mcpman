import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import path from "node:path";
import {
  findLockfile,
  createEmptyLockfile,
  addEntry,
  LOCKFILE_NAME,
  type LockEntry,
} from "../core/lockfile.js";
import { computeIntegrity } from "../core/registry.js";
import type { ClientType } from "../clients/types.js";

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize mcpman.lock in the current project",
  },
  args: {
    yes: {
      type: "boolean",
      alias: "y",
      description: "Auto-import all servers without prompting",
      default: false,
    },
  },
  async run({ args }) {
    const nonInteractive = args.yes || !process.stdout.isTTY;

    p.intro("mcpman init");

    const targetPath = path.join(process.cwd(), LOCKFILE_NAME);

    // Check if lockfile already exists
    const existing = findLockfile();
    if (existing) {
      if (nonInteractive) {
        p.log.warn(`Lockfile already exists: ${existing} — overwriting (non-interactive).`);
      } else {
        p.log.warn(`Lockfile already exists: ${existing}`);
        const overwrite = await p.confirm({ message: "Overwrite?" });
        if (p.isCancel(overwrite) || !overwrite) {
          p.outro("Cancelled.");
          return;
        }
      }
    }

    // Dynamically load client detector (built by dev-2)
    let clients: import("../clients/types.js").ClientHandler[] = [];
    try {
      const mod = await import("../clients/client-detector.js");
      clients = await mod.getInstalledClients();
    } catch {
      p.log.warn("Could not detect AI clients — creating empty lockfile.");
    }

    // Collect servers per client
    const clientServers: Array<{
      client: import("../clients/types.js").ClientHandler;
      servers: Record<string, import("../clients/types.js").ServerEntry>;
    }> = [];

    for (const client of clients) {
      try {
        const config = await client.readConfig();
        if (Object.keys(config.servers).length > 0) {
          clientServers.push({ client, servers: config.servers });
        }
      } catch {
        // skip unreadable configs
      }
    }

    // Create empty lockfile first
    createEmptyLockfile(targetPath);

    if (clientServers.length === 0) {
      p.log.info("No existing servers found in any client config.");
      p.outro(`Created ${LOCKFILE_NAME} — add it to version control!`);
      return;
    }

    let selected: string[];

    if (nonInteractive) {
      // Auto-select all clients in non-interactive mode
      selected = clientServers.map((cs) => cs.client.type);
      p.log.info(`Non-interactive mode: importing all ${clientServers.length} client(s).`);
    } else {
      // Prompt which clients to import from
      const options = clientServers.map((cs) => ({
        value: cs.client.type,
        label: `${cs.client.displayName} (${Object.keys(cs.servers).length} servers)`,
      }));

      const toImport = await p.multiselect<typeof options, string>({
        message: "Import existing servers into lockfile?",
        options,
        required: false,
      });

      if (p.isCancel(toImport)) {
        p.outro(`Created empty ${LOCKFILE_NAME}`);
        return;
      }

      selected = toImport as string[];
    }

    let importCount = 0;

    for (const cs of clientServers) {
      if (!selected.includes(cs.client.type)) continue;
      for (const [name, entry] of Object.entries(cs.servers)) {
        const resolved = `npm:${name}`;
        const lockEntry: LockEntry = {
          version: "unknown",
          source: "npm",
          resolved,
          integrity: computeIntegrity(resolved),
          runtime: "node",
          command: entry.command,
          args: entry.args ?? [],
          envVars: Object.keys(entry.env ?? {}),
          installedAt: new Date().toISOString(),
          clients: [cs.client.type as ClientType],
        };
        addEntry(name, lockEntry, targetPath);
        importCount++;
      }
    }

    p.outro(
      `Created ${LOCKFILE_NAME} with ${importCount} server(s) — commit to version control!`
    );
  },
});
