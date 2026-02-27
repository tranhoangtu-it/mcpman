import { resolveConfigPath } from "../utils/paths.js";
import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientType } from "./types.js";

export class WindsurfHandler extends BaseClientHandler {
  type: ClientType = "windsurf";
  displayName = "Windsurf";

  getConfigPath(): string {
    return resolveConfigPath("windsurf");
  }
}
