import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientType } from "./types.js";
import { resolveConfigPath } from "../utils/paths.js";

export class CursorHandler extends BaseClientHandler {
  type: ClientType = "cursor";
  displayName = "Cursor";

  getConfigPath(): string {
    return resolveConfigPath("cursor");
  }
}
