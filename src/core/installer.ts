import * as p from "@clack/prompts";
import { resolveServer, detectSource, parseEnvFlags } from "./server-resolver.js";
import { addEntry, findLockfile } from "./lockfile.js";
import { computeIntegrity } from "./registry.js";
import type { ClientHandler, ServerEntry } from "../clients/types.js";

export interface InstallOptions {
  client?: string;
  env?: string | string[];
  yes?: boolean;
}

// Dynamically import client detector (built by dev-2)
async function loadClients(): Promise<ClientHandler[]> {
  try {
    const mod = await import("../clients/client-detector.js");
    return mod.getInstalledClients();
  } catch {
    return [];
  }
}

export async function installServer(
  input: string,
  options: InstallOptions = {}
): Promise<void> {
  p.intro("mcpman install");

  // 1. Resolve metadata
  const spinner = p.spinner();
  spinner.start("Resolving server...");

  let metadata: Awaited<ReturnType<typeof resolveServer>>;
  try {
    metadata = await resolveServer(input);
  } catch (err) {
    spinner.stop("Resolution failed");
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  spinner.stop(`Found: ${metadata.name}@${metadata.version}`);

  // 2. Detect installed clients
  const clients = await loadClients();
  if (clients.length === 0) {
    p.log.warn("No supported AI clients detected on this machine.");
    p.log.info("Supported: Claude Desktop, Cursor, VS Code, Windsurf");
    process.exit(1);
  }

  // 3. Select target client(s)
  let selectedClients: ClientHandler[];
  if (options.client) {
    const found = clients.find((c) => c.type === options.client || c.displayName.toLowerCase() === options.client?.toLowerCase());
    if (!found) {
      p.log.error(`Client '${options.client}' not found or not installed.`);
      p.log.info(`Available: ${clients.map((c) => c.type).join(", ")}`);
      process.exit(1);
    }
    selectedClients = [found];
  } else if (options.yes || clients.length === 1) {
    selectedClients = clients;
  } else {
    const chosen = await p.multiselect<{ value: string; label: string }[], string>({
      message: "Install to which client(s)?",
      options: clients.map((c) => ({ value: c.type, label: c.displayName })),
      required: true,
    });
    if (p.isCancel(chosen)) {
      p.outro("Cancelled.");
      process.exit(0);
    }
    selectedClients = clients.filter((c) => (chosen as string[]).includes(c.type));
  }

  // 4. Collect env vars
  const providedEnv = parseEnvFlags(options.env);
  const collectedEnv: Record<string, string> = { ...providedEnv };

  const requiredVars = metadata.envVars.filter((e) => e.required && !(e.name in collectedEnv));
  for (const envVar of requiredVars) {
    if (options.yes && envVar.default) {
      collectedEnv[envVar.name] = envVar.default;
      continue;
    }
    const val = await p.text({
      message: `${envVar.name}${envVar.description ? ` — ${envVar.description}` : ""}`,
      placeholder: envVar.default ?? "",
      validate: (v) => (envVar.required && !v ? "Required" : undefined),
    });
    if (p.isCancel(val)) {
      p.outro("Cancelled.");
      process.exit(0);
    }
    collectedEnv[envVar.name] = val as string;
  }

  // 5. Build ServerEntry
  const entry: ServerEntry = {
    command: metadata.command,
    args: metadata.args,
    ...(Object.keys(collectedEnv).length > 0 ? { env: collectedEnv } : {}),
  };

  // 6. Write to each selected client config
  spinner.start("Writing config...");
  const clientTypes: string[] = [];
  for (const client of selectedClients) {
    try {
      await client.addServer(metadata.name, entry);
      clientTypes.push(client.type);
    } catch (err) {
      spinner.stop("Partial failure");
      p.log.warn(`Failed to write to ${client.displayName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  spinner.stop("Config written");

  // 7. Update lockfile
  const source = detectSource(input);
  const integrity = computeIntegrity(metadata.resolved);
  addEntry(metadata.name, {
    version: metadata.version,
    source: source.type,
    resolved: metadata.resolved,
    integrity,
    runtime: metadata.runtime,
    command: metadata.command,
    args: metadata.args,
    envVars: metadata.envVars.map((e) => e.name),
    installedAt: new Date().toISOString(),
    clients: clientTypes as import("../clients/types.js").ClientType[],
  });

  const lockPath = findLockfile() ?? "mcpman.lock (global)";
  p.log.success(`Lockfile updated: ${lockPath}`);

  p.outro(`${metadata.name}@${metadata.version} installed to ${clientTypes.join(", ")}`);
}
