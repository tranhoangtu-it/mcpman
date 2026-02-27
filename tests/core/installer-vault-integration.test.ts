/**
 * installer-vault-integration.test.ts
 * Tests vault integration helpers: tryLoadVaultSecrets and offerVaultSave.
 * Mocks vault-service and @clack/prompts to isolate logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock vault-service ────────────────────────────────────────────────────────

vi.mock("../../src/core/vault-service.js", () => ({
  getSecretsForServer: vi.fn(),
  getMasterPassword: vi.fn().mockResolvedValue("masterPass1234"),
  setSecret: vi.fn(),
  listSecrets: vi.fn(),
  getVaultPath: vi.fn().mockReturnValue("/tmp/test-vault.enc"),
}));

// ── Mock @clack/prompts ───────────────────────────────────────────────────────

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
  log: {
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  getSecretsForServer,
  getMasterPassword,
  setSecret,
  listSecrets,
} from "../../src/core/vault-service.js";
import * as p from "@clack/prompts";
import {
  tryLoadVaultSecrets,
  offerVaultSave,
} from "../../src/core/installer-vault-helpers.js";

// ── tryLoadVaultSecrets ───────────────────────────────────────────────────────

describe("tryLoadVaultSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
  });

  it("returns {} when vault has no entries for the server", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await tryLoadVaultSecrets("my-server");
    expect(result).toEqual({});
    expect(getMasterPassword).not.toHaveBeenCalled();
  });

  it("returns {} when server exists but has no keys", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "my-server", keys: [] },
    ]);
    const result = await tryLoadVaultSecrets("my-server");
    expect(result).toEqual({});
    expect(getMasterPassword).not.toHaveBeenCalled();
  });

  it("returns decrypted secrets when vault has entries for the server", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "my-server", keys: ["API_KEY", "SECRET"] },
    ]);
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({
      API_KEY: "sk-12345",
      SECRET: "mysecret",
    });

    const result = await tryLoadVaultSecrets("my-server");

    expect(getMasterPassword).toHaveBeenCalledOnce();
    expect(getSecretsForServer).toHaveBeenCalledWith("my-server", "masterPass1234");
    expect(result).toEqual({ API_KEY: "sk-12345", SECRET: "mysecret" });
  });

  it("returns {} silently when getMasterPassword throws (wrong password / cancel)", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "my-server", keys: ["TOKEN"] },
    ]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("wrong password")
    );

    const result = await tryLoadVaultSecrets("my-server");
    expect(result).toEqual({});
  });

  it("returns {} silently when getSecretsForServer throws (decrypt error)", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "my-server", keys: ["TOKEN"] },
    ]);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("ERR_OSSL_BAD_DECRYPT");
    });

    const result = await tryLoadVaultSecrets("my-server");
    expect(result).toEqual({});
  });

  it("returns {} silently when listSecrets throws", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("vault read error");
    });

    const result = await tryLoadVaultSecrets("my-server");
    expect(result).toEqual({});
  });
});

// ── offerVaultSave ────────────────────────────────────────────────────────────

describe("offerVaultSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
  });

  it("does nothing when newVars is empty", async () => {
    await offerVaultSave("my-server", {}, false);
    expect(p.confirm).not.toHaveBeenCalled();
    expect(setSecret).not.toHaveBeenCalled();
  });

  it("does nothing in yes (non-interactive) mode", async () => {
    await offerVaultSave("my-server", { API_KEY: "sk-abc" }, true);
    expect(p.confirm).not.toHaveBeenCalled();
    expect(setSecret).not.toHaveBeenCalled();
  });

  it("calls setSecret for each new var when user confirms", async () => {
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await offerVaultSave("my-server", { API_KEY: "sk-abc", SECRET: "xyz" }, false);

    expect(getMasterPassword).toHaveBeenCalledOnce();
    expect(setSecret).toHaveBeenCalledWith("my-server", "API_KEY", "sk-abc", "masterPass1234");
    expect(setSecret).toHaveBeenCalledWith("my-server", "SECRET", "xyz", "masterPass1234");
    expect(setSecret).toHaveBeenCalledTimes(2);
  });

  it("does not call setSecret when user declines", async () => {
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await offerVaultSave("my-server", { TOKEN: "tok-123" }, false);

    expect(setSecret).not.toHaveBeenCalled();
  });

  it("does not call setSecret when user cancels the confirm prompt", async () => {
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await offerVaultSave("my-server", { TOKEN: "tok-123" }, false);

    expect(setSecret).not.toHaveBeenCalled();
  });

  it("warns but does not throw when setSecret fails", async () => {
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (setSecret as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("vault write failed");
    });

    // Should not throw
    await expect(
      offerVaultSave("my-server", { API_KEY: "sk-abc" }, false)
    ).resolves.toBeUndefined();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("vault write failed")
    );
  });

  it("warns but does not throw when getMasterPassword fails during save", async () => {
    (p.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("password prompt cancelled")
    );

    await expect(
      offerVaultSave("my-server", { API_KEY: "sk-abc" }, false)
    ).resolves.toBeUndefined();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("password prompt cancelled")
    );
  });
});

// ── Integration: priority ordering ───────────────────────────────────────────

describe("env var priority: --env > vault > prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (p.isCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (getMasterPassword as ReturnType<typeof vi.fn>).mockResolvedValue("masterPass1234");
  });

  it("--env flags override vault secrets", async () => {
    // Vault has API_KEY=vault-value
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "srv", keys: ["API_KEY"] },
    ]);
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({
      API_KEY: "vault-value",
    });

    const vaultEnv = await tryLoadVaultSecrets("srv");
    const providedEnv = { API_KEY: "env-flag-value" };

    // Merge: providedEnv wins over vaultEnv
    const collectedEnv = { ...vaultEnv, ...providedEnv };
    expect(collectedEnv.API_KEY).toBe("env-flag-value");
  });

  it("vault value fills gap when no --env flag for that key", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockReturnValue([
      { server: "srv", keys: ["API_KEY"] },
    ]);
    (getSecretsForServer as ReturnType<typeof vi.fn>).mockReturnValue({
      API_KEY: "vault-value",
    });

    const vaultEnv = await tryLoadVaultSecrets("srv");
    const providedEnv = {}; // no --env flags

    const collectedEnv = { ...vaultEnv, ...providedEnv };
    expect(collectedEnv.API_KEY).toBe("vault-value");
  });

  it("vault error falls back gracefully — collectedEnv only has provided", async () => {
    (listSecrets as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("vault corrupt");
    });

    const vaultEnv = await tryLoadVaultSecrets("srv");
    const providedEnv = { TOKEN: "from-flag" };

    const collectedEnv = { ...vaultEnv, ...providedEnv };
    expect(collectedEnv).toEqual({ TOKEN: "from-flag" });
  });
});
