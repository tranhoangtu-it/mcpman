import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientType } from "./types.js";
import { resolveConfigPath } from "../utils/paths.js";

export class WindsurfHandler extends BaseClientHandler {
  type: ClientType = "windsurf";
  displayName = "Windsurf";

  getConfigPath(): string {
    return resolveConfigPath("windsurf");
  }
}
