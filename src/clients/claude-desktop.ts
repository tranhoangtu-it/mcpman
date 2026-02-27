import { resolveConfigPath } from "../utils/paths.js";
import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientType } from "./types.js";

export class ClaudeDesktopHandler extends BaseClientHandler {
  type: ClientType = "claude-desktop";
  displayName = "Claude Desktop";

  getConfigPath(): string {
    return resolveConfigPath("claude-desktop");
  }
}
