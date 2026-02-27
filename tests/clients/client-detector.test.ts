import { describe, expect, it, vi, beforeEach } from "vitest";

// Track mock isInstalled state per client type
const installedMap: Record<string, boolean> = {
  "claude-desktop": false,
  cursor: false,
  vscode: false,
  windsurf: false,
};

function makeHandler(type: string, displayName: string, configPath: string) {
  return {
    type,
    displayName,
    isInstalled: vi.fn(async () => installedMap[type] ?? false),
    getConfigPath: vi.fn(() => configPath),
    readConfig: vi.fn(),
    writeConfig: vi.fn(),
    addServer: vi.fn(),
    removeServer: vi.fn(),
  };
}

vi.mock("../../src/clients/claude-desktop.js", () => ({
  ClaudeDesktopHandler: vi.fn().mockImplementation(() =>
    makeHandler("claude-desktop", "Claude Desktop", "/fake/claude/config.json")
  ),
}));

vi.mock("../../src/clients/cursor.js", () => ({
  CursorHandler: vi.fn().mockImplementation(() =>
    makeHandler("cursor", "Cursor", "/fake/cursor/mcp.json")
  ),
}));

vi.mock("../../src/clients/vscode.js", () => ({
  VSCodeHandler: vi.fn().mockImplementation(() =>
    makeHandler("vscode", "VS Code", "/fake/vscode/settings.json")
  ),
}));

vi.mock("../../src/clients/windsurf.js", () => ({
  WindsurfHandler: vi.fn().mockImplementation(() =>
    makeHandler("windsurf", "Windsurf", "/fake/windsurf/mcp.json")
  ),
}));

import { ClaudeDesktopHandler } from "../../src/clients/claude-desktop.js";
import { CursorHandler } from "../../src/clients/cursor.js";
import { VSCodeHandler } from "../../src/clients/vscode.js";
import { WindsurfHandler } from "../../src/clients/windsurf.js";
import {
  getAllClientTypes,
  getClient,
  getInstalledClients,
} from "../../src/clients/client-detector.js";

describe("client-detector", () => {
  beforeEach(() => {
    // Reset all to not installed
    for (const key of Object.keys(installedMap)) {
      installedMap[key] = false;
    }
    vi.clearAllMocks();
  });

  describe("getAllClientTypes()", () => {
    it("returns all four supported client types", () => {
      const types = getAllClientTypes();
      expect(types).toHaveLength(4);
      expect(types).toContain("claude-desktop");
      expect(types).toContain("cursor");
      expect(types).toContain("vscode");
      expect(types).toContain("windsurf");
    });
  });

  describe("getClient()", () => {
    it("returns handler with type claude-desktop", () => {
      const handler = getClient("claude-desktop");
      expect(handler.type).toBe("claude-desktop");
      expect(ClaudeDesktopHandler).toHaveBeenCalled();
    });

    it("returns handler with type cursor", () => {
      const handler = getClient("cursor");
      expect(handler.type).toBe("cursor");
      expect(CursorHandler).toHaveBeenCalled();
    });

    it("returns handler with type vscode", () => {
      const handler = getClient("vscode");
      expect(handler.type).toBe("vscode");
      expect(VSCodeHandler).toHaveBeenCalled();
    });

    it("returns handler with type windsurf", () => {
      const handler = getClient("windsurf");
      expect(handler.type).toBe("windsurf");
      expect(WindsurfHandler).toHaveBeenCalled();
    });

    it("handler exposes getConfigPath()", () => {
      const handler = getClient("claude-desktop");
      expect(typeof handler.getConfigPath).toBe("function");
      expect(typeof handler.getConfigPath()).toBe("string");
    });
  });

  describe("getInstalledClients()", () => {
    it("returns empty array when no clients are installed", async () => {
      const installed = await getInstalledClients();
      expect(installed).toHaveLength(0);
    });

    it("returns only claude-desktop when only it is installed", async () => {
      installedMap["claude-desktop"] = true;
      const installed = await getInstalledClients();
      expect(installed).toHaveLength(1);
      expect(installed[0].type).toBe("claude-desktop");
    });

    it("returns multiple clients when several are installed", async () => {
      installedMap["claude-desktop"] = true;
      installedMap["cursor"] = true;
      const installed = await getInstalledClients();
      expect(installed).toHaveLength(2);
      const types = installed.map((h) => h.type);
      expect(types).toContain("claude-desktop");
      expect(types).toContain("cursor");
    });

    it("returns all four when all are installed", async () => {
      for (const key of Object.keys(installedMap)) {
        installedMap[key] = true;
      }
      const installed = await getInstalledClients();
      expect(installed).toHaveLength(4);
    });
  });
});
