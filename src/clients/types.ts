export type ClientType = "claude-desktop" | "cursor" | "vscode" | "windsurf";

export interface ServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClientConfig {
  servers: Record<string, ServerEntry>;
}

export interface ClientHandler {
  type: ClientType;
  displayName: string;
  isInstalled(): Promise<boolean>;
  getConfigPath(): string;
  readConfig(): Promise<ClientConfig>;
  writeConfig(config: ClientConfig): Promise<void>;
  addServer(name: string, entry: ServerEntry): Promise<void>;
  removeServer(name: string): Promise<void>;
}

// Error classes for config operations
export class ConfigNotFoundError extends Error {
  constructor(public configPath: string) {
    super(`Config file not found: ${configPath}`);
    this.name = "ConfigNotFoundError";
  }
}

export class ConfigParseError extends Error {
  constructor(
    public configPath: string,
    cause: unknown
  ) {
    super(`Failed to parse config: ${configPath} — ${String(cause)}`);
    this.name = "ConfigParseError";
  }
}

export class ConfigWriteError extends Error {
  constructor(
    public configPath: string,
    cause: unknown
  ) {
    super(`Failed to write config: ${configPath} — ${String(cause)}`);
    this.name = "ConfigWriteError";
  }
}
