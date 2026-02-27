import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must mock picocolors before importing logger
vi.mock("picocolors", () => ({
  default: {
    cyan: (s: string) => `[cyan]${s}[/cyan]`,
    green: (s: string) => `[green]${s}[/green]`,
    yellow: (s: string) => `[yellow]${s}[/yellow]`,
    red: (s: string) => `[red]${s}[/red]`,
    gray: (s: string) => `[gray]${s}[/gray]`,
  },
}));

describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset argv and env to clean state
    vi.stubGlobal("process", {
      ...process,
      argv: ["node", "mcpman"],
      env: { ...process.env, NO_COLOR: undefined },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("info()", () => {
    it("outputs message with cyan prefix", async () => {
      const { info } = await import("../../src/utils/logger.js");
      info("hello world");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("hello world")
      );
    });
  });

  describe("success()", () => {
    it("outputs message with green prefix", async () => {
      const { success } = await import("../../src/utils/logger.js");
      success("done");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("done"));
    });
  });

  describe("warn()", () => {
    it("outputs to console.warn with yellow prefix", async () => {
      const { warn } = await import("../../src/utils/logger.js");
      warn("be careful");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("be careful")
      );
    });
  });

  describe("error()", () => {
    it("outputs to console.error with red prefix", async () => {
      const { error } = await import("../../src/utils/logger.js");
      error("something failed");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("something failed")
      );
    });
  });

  describe("json()", () => {
    it("always outputs JSON regardless of flags", async () => {
      const { json } = await import("../../src/utils/logger.js");
      json({ key: "value" });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key": "value"')
      );
    });
  });
});
