import { ClaudeDesktopHandler } from "./claude-desktop.js";
import { CursorHandler } from "./cursor.js";
import type { ClientHandler, ClientType } from "./types.js";
import { VSCodeHandler } from "./vscode.js";
import { WindsurfHandler } from "./windsurf.js";

/** All supported client types */
export function getAllClientTypes(): ClientType[] {
  return ["claude-desktop", "cursor", "vscode", "windsurf"];
}

/** Get handler instance for a specific client type */
export function getClient(type: ClientType): ClientHandler {
  switch (type) {
    case "claude-desktop":
      return new ClaudeDesktopHandler();
    case "cursor":
      return new CursorHandler();
    case "vscode":
      return new VSCodeHandler();
    case "windsurf":
      return new WindsurfHandler();
  }
}

/** Returns handlers for all AI clients that appear to be installed on the system */
export async function getInstalledClients(): Promise<ClientHandler[]> {
  const all = getAllClientTypes().map(getClient);
  const results = await Promise.all(
    all.map(async (handler) => ({ handler, installed: await handler.isInstalled() })),
  );
  return results.filter((r) => r.installed).map((r) => r.handler);
}
