import fs from "node:fs";
import path from "node:path";
import type { ClientConfig, ClientHandler, ClientType, ServerEntry } from "./types.js";
import { ConfigParseError, ConfigWriteError } from "./types.js";

/** Shared atomic write: write to .tmp then rename */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
    await fs.promises.rename(tmpPath, filePath);
  } catch (err) {
    // Clean up tmp file if rename failed
    try { await fs.promises.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/** Check if a path exists (file or directory) */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Abstract base for simple JSON clients that store mcpServers at top-level.
 * Subclass overrides: type, displayName, getConfigPath(), and optionally
 * toClientConfig()/fromClientConfig() for clients with non-standard formats.
 */
export abstract class BaseClientHandler implements ClientHandler {
  abstract type: ClientType;
  abstract displayName: string;
  abstract getConfigPath(): string;

  async isInstalled(): Promise<boolean> {
    const dir = path.dirname(this.getConfigPath());
    return pathExists(dir);
  }

  /** Read raw JSON from disk, return empty object if file missing */
  protected async readRaw(): Promise<Record<string, unknown>> {
    const configPath = this.getConfigPath();
    try {
      const raw = await fs.promises.readFile(configPath, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw new ConfigParseError(configPath, err);
    }
  }

  /** Serialize raw object to disk atomically */
  protected async writeRaw(data: Record<string, unknown>): Promise<void> {
    const configPath = this.getConfigPath();
    try {
      await atomicWrite(configPath, JSON.stringify(data, null, 2));
    } catch (err) {
      throw new ConfigWriteError(configPath, err);
    }
  }

  /** Convert raw JSON to ClientConfig — override for non-standard formats */
  protected toClientConfig(raw: Record<string, unknown>): ClientConfig {
    const mcpServers = (raw.mcpServers ?? {}) as Record<string, ServerEntry>;
    return { servers: mcpServers };
  }

  /** Merge ClientConfig back into raw JSON — override for non-standard formats */
  protected fromClientConfig(
    raw: Record<string, unknown>,
    config: ClientConfig
  ): Record<string, unknown> {
    return { ...raw, mcpServers: config.servers };
  }

  async readConfig(): Promise<ClientConfig> {
    const raw = await this.readRaw();
    return this.toClientConfig(raw);
  }

  async writeConfig(config: ClientConfig): Promise<void> {
    const raw = await this.readRaw();
    await this.writeRaw(this.fromClientConfig(raw, config));
  }

  async addServer(name: string, entry: ServerEntry): Promise<void> {
    const config = await this.readConfig();
    config.servers[name] = entry;
    await this.writeConfig(config);
  }

  async removeServer(name: string): Promise<void> {
    const config = await this.readConfig();
    delete config.servers[name];
    await this.writeConfig(config);
  }
}
