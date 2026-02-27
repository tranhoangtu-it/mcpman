import { resolveConfigPath } from "../utils/paths.js";
import { BaseClientHandler } from "./base-client-handler.js";
import type { ClientType } from "./types.js";

export class CursorHandler extends BaseClientHandler {
  type: ClientType = "cursor";
  displayName = "Cursor";

  getConfigPath(): string {
    return resolveConfigPath("cursor");
  }
}
