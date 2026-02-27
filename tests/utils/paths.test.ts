import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

describe("paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe("getHomedir()", () => {
    it("returns string", async () => {
      const { getHomedir } = await import("../../src/utils/paths.js");
      expect(typeof getHomedir()).toBe("string");
      expect(getHomedir().length).toBeGreaterThan(0);
    });
  });

  describe("getAppDataDir()", () => {
    it("returns Library/Application Support on darwin", async () => {
      vi.stubGlobal("process", { ...process, platform: "darwin" });
      vi.resetModules();
      const { getAppDataDir, getHomedir } = await import(
        "../../src/utils/paths.js"
      );
      expect(getAppDataDir()).toBe(
        path.join(getHomedir(), "Library", "Application Support")
      );
    });

    it("returns ~/.config on linux without XDG_CONFIG_HOME", async () => {
      vi.stubGlobal("process", {
        ...process,
        platform: "linux",
        env: { ...process.env, XDG_CONFIG_HOME: undefined },
      });
      vi.resetModules();
      const { getAppDataDir, getHomedir } = await import(
        "../../src/utils/paths.js"
      );
      expect(getAppDataDir()).toBe(path.join(getHomedir(), ".config"));
    });

    it("uses XDG_CONFIG_HOME on linux when set", async () => {
      vi.stubGlobal("process", {
        ...process,
        platform: "linux",
        env: { ...process.env, XDG_CONFIG_HOME: "/custom/config" },
      });
      vi.resetModules();
      const { getAppDataDir } = await import("../../src/utils/paths.js");
      expect(getAppDataDir()).toBe("/custom/config");
    });
  });

  describe("resolveConfigPath()", () => {
    beforeEach(() => {
      vi.stubGlobal("process", { ...process, platform: "darwin" });
      vi.resetModules();
    });

    it("resolves claude-desktop path", async () => {
      const { resolveConfigPath } = await import("../../src/utils/paths.js");
      const p = resolveConfigPath("claude-desktop");
      expect(p).toContain("Claude");
      expect(p.endsWith("claude_desktop_config.json")).toBe(true);
    });

    it("resolves cursor path", async () => {
      const { resolveConfigPath } = await import("../../src/utils/paths.js");
      const p = resolveConfigPath("cursor");
      expect(p).toContain("Cursor");
      expect(p.endsWith("mcp.json")).toBe(true);
    });

    it("resolves windsurf path", async () => {
      const { resolveConfigPath } = await import("../../src/utils/paths.js");
      const p = resolveConfigPath("windsurf");
      expect(p).toContain("Windsurf");
      expect(p.endsWith("mcp.json")).toBe(true);
    });

    it("resolves vscode path on darwin", async () => {
      const { resolveConfigPath } = await import("../../src/utils/paths.js");
      const p = resolveConfigPath("vscode");
      expect(p).toContain("Code");
      expect(p.endsWith("settings.json")).toBe(true);
    });
  });
});
