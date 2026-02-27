/**
 * vault-service.test.ts
 * Unit tests for encrypted vault CRUD operations and crypto primitives.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  encrypt,
  decrypt,
  readVault,
  writeVault,
  setSecret,
  getSecret,
  getSecretsForServer,
  removeSecret,
  listSecrets,
  clearPasswordCache,
  type VaultData,
} from "../../src/core/vault-service.js";

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeTmpVaultPath(): string {
  const dir = path.join(os.tmpdir(), `mcpman-vault-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "vault.enc");
}

function cleanup(vaultPath: string): void {
  const dir = path.dirname(vaultPath);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Crypto roundtrip ──────────────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("roundtrip returns original value", () => {
    const password = "superSecretPass1";
    const original = "ghp_mysecrettoken";
    const entry = encrypt(original, password);
    const recovered = decrypt(entry, password);
    expect(recovered).toBe(original);
  });

  it("produces different ciphertext on each call (unique salt+iv)", () => {
    const password = "pa$$word123";
    const value = "same-value";
    const e1 = encrypt(value, password);
    const e2 = encrypt(value, password);
    expect(e1.data).not.toBe(e2.data);
    expect(e1.salt).not.toBe(e2.salt);
    expect(e1.iv).not.toBe(e2.iv);
  });

  it("throws on wrong password", () => {
    const entry = encrypt("secret", "correct-password-123");
    expect(() => decrypt(entry, "wrong-password-456")).toThrow();
  });

  it("handles empty string value", () => {
    const password = "mypassword123";
    const entry = encrypt("", password);
    const recovered = decrypt(entry, password);
    expect(recovered).toBe("");
  });

  it("handles unicode / special chars in value", () => {
    const password = "passwordABCD1234";
    const value = "token=abc!@#$%^&*() 中文";
    const entry = encrypt(value, password);
    expect(decrypt(entry, password)).toBe(value);
  });
});

// ── readVault / writeVault ────────────────────────────────────────────────────

describe("readVault", () => {
  it("returns empty vault when file does not exist", () => {
    const vaultPath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.enc`);
    const vault = readVault(vaultPath);
    expect(vault.version).toBe(1);
    expect(vault.servers).toEqual({});
  });

  it("returns empty vault on invalid JSON", () => {
    const vaultPath = makeTmpVaultPath();
    fs.writeFileSync(vaultPath, "NOT JSON");
    const vault = readVault(vaultPath);
    expect(vault.servers).toEqual({});
    cleanup(vaultPath);
  });

  it("reads valid vault file", () => {
    const vaultPath = makeTmpVaultPath();
    const data: VaultData = {
      version: 1,
      servers: {
        "test-server": {
          MY_KEY: { salt: "aabb", iv: "ccdd", data: "eeff" },
        },
      },
    };
    fs.writeFileSync(vaultPath, JSON.stringify(data));
    const vault = readVault(vaultPath);
    expect(vault.servers["test-server"]).toBeDefined();
    cleanup(vaultPath);
  });
});

describe("writeVault", () => {
  it("creates parent directory if missing", () => {
    const dir = path.join(os.tmpdir(), `mcpman-newdir-${Date.now()}`);
    const vaultPath = path.join(dir, "nested", "vault.enc");
    const data: VaultData = { version: 1, servers: {} };
    writeVault(data, vaultPath);
    expect(fs.existsSync(vaultPath)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("atomic write: no leftover .tmp file", () => {
    const vaultPath = makeTmpVaultPath();
    writeVault({ version: 1, servers: {} }, vaultPath);
    expect(fs.existsSync(`${vaultPath}.tmp`)).toBe(false);
    cleanup(vaultPath);
  });

  it("sets 0o600 permissions on Unix", () => {
    if (process.platform === "win32") return;
    const vaultPath = makeTmpVaultPath();
    writeVault({ version: 1, servers: {} }, vaultPath);
    const stat = fs.statSync(vaultPath);
    // eslint-disable-next-line no-bitwise
    const perms = stat.mode & 0o777;
    expect(perms).toBe(0o600);
    cleanup(vaultPath);
  });
});

// ── CRUD: setSecret / getSecret / removeSecret / listSecrets ─────────────────

describe("setSecret / getSecret", () => {
  let vaultPath: string;
  const PASSWORD = "testMasterPass1";

  beforeEach(() => {
    vaultPath = makeTmpVaultPath();
    clearPasswordCache();
  });

  afterEach(() => {
    cleanup(vaultPath);
    clearPasswordCache();
  });

  it("stores and retrieves a secret", () => {
    setSecret("my-server", "API_KEY", "sk-abcdef", PASSWORD, vaultPath);
    const val = getSecret("my-server", "API_KEY", PASSWORD, vaultPath);
    expect(val).toBe("sk-abcdef");
  });

  it("returns null for missing key", () => {
    const val = getSecret("no-server", "MISSING", PASSWORD, vaultPath);
    expect(val).toBeNull();
  });

  it("returns null for missing server", () => {
    setSecret("server-a", "K", "v", PASSWORD, vaultPath);
    const val = getSecret("server-b", "K", PASSWORD, vaultPath);
    expect(val).toBeNull();
  });

  it("overwrites existing key", () => {
    setSecret("srv", "TOKEN", "old-value", PASSWORD, vaultPath);
    setSecret("srv", "TOKEN", "new-value", PASSWORD, vaultPath);
    expect(getSecret("srv", "TOKEN", PASSWORD, vaultPath)).toBe("new-value");
  });

  it("throws on wrong password during getSecret", () => {
    setSecret("srv", "KEY", "value", PASSWORD, vaultPath);
    expect(() => getSecret("srv", "KEY", "wrong-password-!!", vaultPath)).toThrow();
  });
});

describe("getSecretsForServer", () => {
  let vaultPath: string;
  const PASSWORD = "anotherPass1234";

  beforeEach(() => {
    vaultPath = makeTmpVaultPath();
    clearPasswordCache();
  });

  afterEach(() => {
    cleanup(vaultPath);
    clearPasswordCache();
  });

  it("returns all decrypted secrets for a server", () => {
    setSecret("gh", "TOKEN", "ghp_abc", PASSWORD, vaultPath);
    setSecret("gh", "WEBHOOK", "whsec_xyz", PASSWORD, vaultPath);
    const secrets = getSecretsForServer("gh", PASSWORD, vaultPath);
    expect(secrets["TOKEN"]).toBe("ghp_abc");
    expect(secrets["WEBHOOK"]).toBe("whsec_xyz");
  });

  it("returns empty record for unknown server", () => {
    const secrets = getSecretsForServer("unknown", PASSWORD, vaultPath);
    expect(secrets).toEqual({});
  });
});

describe("removeSecret", () => {
  let vaultPath: string;
  const PASSWORD = "removeTestPass1";

  beforeEach(() => {
    vaultPath = makeTmpVaultPath();
    clearPasswordCache();
  });

  afterEach(() => {
    cleanup(vaultPath);
    clearPasswordCache();
  });

  it("removes a specific key", () => {
    setSecret("srv", "A", "1", PASSWORD, vaultPath);
    setSecret("srv", "B", "2", PASSWORD, vaultPath);
    removeSecret("srv", "A", vaultPath);
    expect(getSecret("srv", "A", PASSWORD, vaultPath)).toBeNull();
    expect(getSecret("srv", "B", PASSWORD, vaultPath)).toBe("2");
  });

  it("removes server entry when last key is deleted", () => {
    setSecret("srv", "ONLY", "val", PASSWORD, vaultPath);
    removeSecret("srv", "ONLY", vaultPath);
    const vault = readVault(vaultPath);
    expect(vault.servers["srv"]).toBeUndefined();
  });

  it("is a no-op for nonexistent server/key", () => {
    expect(() => removeSecret("ghost", "KEY", vaultPath)).not.toThrow();
  });
});

// ── listSecrets ───────────────────────────────────────────────────────────────

describe("listSecrets", () => {
  let vaultPath: string;
  const PASSWORD = "listTestPass1234";

  beforeEach(() => {
    vaultPath = makeTmpVaultPath();
    clearPasswordCache();
    setSecret("server-a", "KEY1", "v1", PASSWORD, vaultPath);
    setSecret("server-a", "KEY2", "v2", PASSWORD, vaultPath);
    setSecret("server-b", "TOKEN", "v3", PASSWORD, vaultPath);
  });

  afterEach(() => {
    cleanup(vaultPath);
    clearPasswordCache();
  });

  it("returns all servers and keys without decryption", () => {
    const results = listSecrets(undefined, vaultPath);
    expect(results).toHaveLength(2);
    const a = results.find((r) => r.server === "server-a");
    expect(a?.keys).toContain("KEY1");
    expect(a?.keys).toContain("KEY2");
    const b = results.find((r) => r.server === "server-b");
    expect(b?.keys).toContain("TOKEN");
  });

  it("filters by server name", () => {
    const results = listSecrets("server-b", vaultPath);
    expect(results).toHaveLength(1);
    expect(results[0].server).toBe("server-b");
  });

  it("returns empty array for unknown server filter", () => {
    const results = listSecrets("no-such-server", vaultPath);
    expect(results).toEqual([]);
  });

  it("returns empty array for empty vault", () => {
    const empty = makeTmpVaultPath();
    const results = listSecrets(undefined, empty);
    expect(results).toEqual([]);
    cleanup(empty);
  });
});
