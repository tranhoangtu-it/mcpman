import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientConfig, ClientType, ServerEntry } from "./types.js";
import { resolveConfigPath } from "../utils/paths.js";

/**
 * VS Code stores MCP servers under the "mcp" → "servers" key in settings.json,
 * not under "mcpServers" like other clients.
 * Format: { "mcp": { "servers": { "name": { "command": "...", ... } } } }
 */
export class VSCodeHandler extends BaseClientHandler {
  type: ClientType = "vscode";
  displayName = "VS Code";

  getConfigPath(): string {
    return resolveConfigPath("vscode");
  }

  protected toClientConfig(raw: Record<string, unknown>): ClientConfig {
    const mcp = (raw.mcp ?? {}) as Record<string, unknown>;
    const servers = (mcp.servers ?? {}) as Record<string, ServerEntry>;
    return { servers };
  }

  protected fromClientConfig(
    raw: Record<string, unknown>,
    config: ClientConfig
  ): Record<string, unknown> {
    const existingMcp = (raw.mcp ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      mcp: { ...existingMcp, servers: config.servers },
    };
  }
}
