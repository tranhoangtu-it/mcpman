import os from "node:os";
import path from "node:path";
import type { ClientType } from "../clients/types.js";

export function getHomedir(): string {
  return os.homedir();
}

/** Returns mcpman data dir: ~/.mcpman */
export function getMcpmanDir(): string {
  return path.join(os.homedir(), ".mcpman");
}

/** Returns mcpman config file path: ~/.mcpman/config.json */
export function getConfigPath(): string {
  return path.join(getMcpmanDir(), "config.json");
}

/** Returns mcpman plugins dir: ~/.mcpman/plugins */
export function getPluginDir(): string {
  return path.join(getMcpmanDir(), "plugins");
}

/** Returns mcpman profiles dir: ~/.mcpman/profiles */
export function getProfilesDir(): string {
  return path.join(getMcpmanDir(), "profiles");
}

/** Returns platform app data dir: ~/Library/Application Support (mac), ~/.config (linux), %APPDATA% (win) */
export function getAppDataDir(): string {
  const home = getHomedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
  }
  // Linux
  return process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
}

/** Returns full config file path for a given client on current platform */
export function resolveConfigPath(client: ClientType): string {
  const appData = getAppDataDir();
  const home = getHomedir();

  switch (client) {
    case "claude-desktop":
      return path.join(appData, "Claude", "claude_desktop_config.json");

    case "cursor":
      return path.join(appData, "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json");

    case "windsurf":
      return path.join(
        appData,
        "Windsurf",
        "User",
        "globalStorage",
        "windsurf.mcpConfigJson",
        "mcp.json",
      );

    case "vscode":
      // Use global user-level settings.json (not workspace .vscode/mcp.json)
      if (process.platform === "darwin") {
        return path.join(appData, "Code", "User", "settings.json");
      }
      if (process.platform === "win32") {
        return path.join(appData, "Code", "User", "settings.json");
      }
      return path.join(home, ".config", "Code", "User", "settings.json");
  }
}
