/**
 * notify-service.test.ts
 * Unit tests for event webhook/shell hook service at ~/.mcpman/notify.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/paths.js", () => ({
  getNotifyFile: vi.fn(),
}));

// Mock execSync for shell hooks
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { getNotifyFile } from "../../src/utils/paths.js";
import {
  addHook,
  fireEvent,
  listHooks,
  removeHook,
} from "../../src/core/notify-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-notify-test-"));
  return path.join(dir, "notify.json");
}

function cleanup(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── addHook / listHooks ───────────────────────────────────────────────────────

describe("addHook / listHooks", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getNotifyFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("adds a webhook hook", () => {
    addHook("install", "webhook", "https://example.com/hook");
    const hooks = listHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toEqual({ event: "install", type: "webhook", target: "https://example.com/hook" });
  });

  it("adds a shell hook", () => {
    addHook("health-fail", "shell", "echo alert");
    const hooks = listHooks();
    expect(hooks[0].type).toBe("shell");
    expect(hooks[0].event).toBe("health-fail");
  });

  it("accumulates multiple hooks", () => {
    addHook("install", "webhook", "https://a.com");
    addHook("remove", "shell", "echo removed");
    expect(listHooks()).toHaveLength(2);
  });

  it("creates parent directory if missing", () => {
    const nested = path.join(os.tmpdir(), `notify-nested-${Date.now()}`, "notify.json");
    vi.mocked(getNotifyFile).mockReturnValue(nested);
    addHook("update", "shell", "echo upd");
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });
});

// ── removeHook ────────────────────────────────────────────────────────────────

describe("removeHook", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getNotifyFile).mockReturnValue(file);
  });
  afterEach(() => cleanup(file));

  it("removes hook by index", () => {
    addHook("install", "webhook", "https://a.com");
    addHook("remove", "shell", "echo b");
    removeHook(0);
    const hooks = listHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].event).toBe("remove");
  });

  it("throws for out-of-range index", () => {
    addHook("install", "shell", "echo a");
    expect(() => removeHook(5)).toThrow("out of range");
  });

  it("throws for negative index", () => {
    addHook("install", "shell", "echo a");
    expect(() => removeHook(-1)).toThrow("out of range");
  });
});

// ── fireEvent — shell hooks ───────────────────────────────────────────────────

describe("fireEvent (shell hooks)", () => {
  let file: string;
  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getNotifyFile).mockReturnValue(file);
    vi.mocked(execSync).mockReset();
  });
  afterEach(() => cleanup(file));

  it("calls execSync for shell hooks matching event", async () => {
    addHook("install", "shell", "echo installed");
    await fireEvent("install", { server: "pkg" });
    expect(execSync).toHaveBeenCalledWith("echo installed", expect.objectContaining({ stdio: "inherit" }));
  });

  it("does not call execSync for non-matching events", async () => {
    addHook("remove", "shell", "echo removed");
    await fireEvent("install", { server: "pkg" });
    expect(execSync).not.toHaveBeenCalled();
  });

  it("passes MCPMAN_EVENT and MCPMAN_PAYLOAD env vars", async () => {
    addHook("update", "shell", "echo updated");
    await fireEvent("update", { server: "pkg", version: "1.0.0" });
    const call = vi.mocked(execSync).mock.calls[0];
    const opts = call[1] as { env: NodeJS.ProcessEnv };
    expect(opts.env.MCPMAN_EVENT).toBe("update");
    expect(opts.env.MCPMAN_PAYLOAD).toContain("pkg");
  });
});

// ── fireEvent — webhook hooks ─────────────────────────────────────────────────

describe("fireEvent (webhook hooks)", () => {
  let file: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    file = makeTmpFile();
    vi.mocked(getNotifyFile).mockReturnValue(file);
    // Mock global fetch
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup(file);
    vi.unstubAllGlobals();
  });

  it("calls fetch with POST and JSON body for webhook hooks", async () => {
    addHook("health-fail", "webhook", "https://example.com/hook");
    await fireEvent("health-fail", { server: "bad-server" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not call fetch when no webhook hooks match", async () => {
    addHook("install", "shell", "echo a");
    await fireEvent("health-fail", {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
