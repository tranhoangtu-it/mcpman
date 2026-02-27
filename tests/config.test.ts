/**
 * config.test.ts
 * Unit tests for config-service.ts CRUD functions.
 * Uses a real temp directory for isolation (no fs mocks needed).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  deleteConfigValue,
  type ConfigData,
} from "../src/core/config-service.js";

// ── Temp dir fixture ───────────────────────────────────────────────────────

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-config-test-"));
  configPath = path.join(tmpDir, "config.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── readConfig ─────────────────────────────────────────────────────────────

describe("readConfig()", () => {
  it("returns {} when file does not exist", () => {
    const data = readConfig(configPath);
    expect(data).toEqual({});
  });

  it("returns {} when file contains invalid JSON", () => {
    fs.writeFileSync(configPath, "NOT_JSON", "utf-8");
    const data = readConfig(configPath);
    expect(data).toEqual({});
  });

  it("returns {} when file contains non-object JSON", () => {
    fs.writeFileSync(configPath, JSON.stringify([1, 2, 3]), "utf-8");
    const data = readConfig(configPath);
    expect(data).toEqual({});
  });

  it("reads existing config correctly", () => {
    const stored: ConfigData = { defaultClient: "cursor", updateCheckInterval: 48 };
    fs.writeFileSync(configPath, JSON.stringify(stored), "utf-8");
    const data = readConfig(configPath);
    expect(data.defaultClient).toBe("cursor");
    expect(data.updateCheckInterval).toBe(48);
  });
});

// ── writeConfig ────────────────────────────────────────────────────────────

describe("writeConfig()", () => {
  it("creates file with correct content", () => {
    const payload: ConfigData = { defaultClient: "claude-desktop", vaultTimeout: 15 };
    writeConfig(payload, configPath);
    expect(fs.existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(parsed.defaultClient).toBe("claude-desktop");
    expect(parsed.vaultTimeout).toBe(15);
  });

  it("atomic write: no .tmp file left behind after success", () => {
    writeConfig({ defaultClient: "vscode" }, configPath);
    expect(fs.existsSync(`${configPath}.tmp`)).toBe(false);
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("creates parent directory if missing", () => {
    const nestedPath = path.join(tmpDir, "nested", "deep", "config.json");
    writeConfig({ vaultTimeout: 60 }, nestedPath);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it("overwrites existing config", () => {
    writeConfig({ defaultClient: "claude-desktop" }, configPath);
    writeConfig({ defaultClient: "cursor" }, configPath);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(parsed.defaultClient).toBe("cursor");
  });
});

// ── setConfigValue + getConfigValue ────────────────────────────────────────

describe("setConfigValue() + getConfigValue()", () => {
  it("roundtrip: set then get returns same value (string)", () => {
    setConfigValue("defaultClient", "claude-desktop", configPath);
    const val = getConfigValue("defaultClient", configPath);
    expect(val).toBe("claude-desktop");
  });

  it("roundtrip: set then get returns same value (number)", () => {
    setConfigValue("updateCheckInterval", 12, configPath);
    const val = getConfigValue("updateCheckInterval", configPath);
    expect(val).toBe(12);
  });

  it("roundtrip: set then get returns same value (preferredRegistry)", () => {
    setConfigValue("preferredRegistry", "smithery", configPath);
    const val = getConfigValue("preferredRegistry", configPath);
    expect(val).toBe("smithery");
  });

  it("get returns undefined for unknown key", () => {
    const val = getConfigValue("nonExistentKey", configPath);
    expect(val).toBeUndefined();
  });

  it("get returns undefined when key not set", () => {
    writeConfig({}, configPath);
    const val = getConfigValue("defaultClient", configPath);
    expect(val).toBeUndefined();
  });

  it("set throws for unknown key", () => {
    expect(() => setConfigValue("unknownKey", "value", configPath)).toThrow(/Unknown config key/);
  });

  it("multiple sets accumulate without clobbering other keys", () => {
    setConfigValue("defaultClient", "vscode", configPath);
    setConfigValue("vaultTimeout", 45, configPath);
    expect(getConfigValue("defaultClient", configPath)).toBe("vscode");
    expect(getConfigValue("vaultTimeout", configPath)).toBe(45);
  });

  it("overwrite existing key with new value", () => {
    setConfigValue("defaultClient", "cursor", configPath);
    setConfigValue("defaultClient", "windsurf", configPath);
    expect(getConfigValue("defaultClient", configPath)).toBe("windsurf");
  });
});

// ── deleteConfigValue ──────────────────────────────────────────────────────

describe("deleteConfigValue()", () => {
  it("removes an existing key", () => {
    setConfigValue("vaultTimeout", 30, configPath);
    deleteConfigValue("vaultTimeout", configPath);
    const val = getConfigValue("vaultTimeout", configPath);
    expect(val).toBeUndefined();
  });

  it("is a no-op when key does not exist", () => {
    writeConfig({ defaultClient: "cursor" }, configPath);
    expect(() => deleteConfigValue("updateCheckInterval", configPath)).not.toThrow();
    // Other keys should be intact
    expect(getConfigValue("defaultClient", configPath)).toBe("cursor");
  });

  it("does not write file when key was absent", () => {
    writeConfig({ defaultClient: "vscode" }, configPath);
    const statBefore = fs.statSync(configPath).mtimeMs;
    // Sleep 5ms to ensure mtime would differ if file were rewritten
    const deadline = Date.now() + 5;
    while (Date.now() < deadline) { /* busy wait */ }
    deleteConfigValue("updateCheckInterval", configPath); // not present
    const statAfter = fs.statSync(configPath).mtimeMs;
    // mtime unchanged = no rewrite
    expect(statAfter).toBe(statBefore);
  });

  it("remaining keys are intact after delete", () => {
    setConfigValue("defaultClient", "claude-desktop", configPath);
    setConfigValue("vaultTimeout", 20, configPath);
    deleteConfigValue("vaultTimeout", configPath);
    const data = readConfig(configPath);
    expect(data.defaultClient).toBe("claude-desktop");
    expect(data.vaultTimeout).toBeUndefined();
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("writeConfig with empty object produces valid JSON file", () => {
    writeConfig({}, configPath);
    const raw = fs.readFileSync(configPath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toEqual({});
  });

  it("readConfig is idempotent — multiple reads return same result", () => {
    writeConfig({ preferredRegistry: "npm", updateCheckInterval: 6 }, configPath);
    const first = readConfig(configPath);
    const second = readConfig(configPath);
    expect(first).toEqual(second);
  });
});
