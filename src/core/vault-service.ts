/**
 * vault-service.ts
 * Encrypted secret storage for MCP server credentials.
 * Uses AES-256-CBC + PBKDF2 (node:crypto only, zero extra deps).
 * Vault file: ~/.mcpman/vault.enc  perms: 0o600
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";

// ── Types ──────────────────────────────────────────────────────────────────

/** One encrypted secret entry (salt + iv + cipher text, all hex strings). */
export interface EncryptedEntry {
  salt: string;
  iv: string;
  data: string;
}

/** Top-level vault file structure persisted to disk. */
export interface VaultData {
  version: 1;
  servers: Record<string, Record<string, EncryptedEntry>>;
}

// ── Session cache ──────────────────────────────────────────────────────────

/** Master password cached for the lifetime of the process. Never written to disk. */
let _cachedPassword: string | null = null;

process.on("exit", () => {
  _cachedPassword = null;
});

// ── Path helpers ───────────────────────────────────────────────────────────

export function getVaultPath(): string {
  return path.join(os.homedir(), ".mcpman", "vault.enc");
}

// ── File I/O ───────────────────────────────────────────────────────────────

/** Read vault from disk; returns empty vault if file missing or corrupt. */
export function readVault(vaultPath = getVaultPath()): VaultData {
  const empty: VaultData = { version: 1, servers: {} };
  try {
    const raw = fs.readFileSync(vaultPath, "utf-8");
    const parsed = JSON.parse(raw) as VaultData;
    if (parsed.version !== 1 || typeof parsed.servers !== "object") return empty;
    return parsed;
  } catch {
    return empty;
  }
}

/** Atomic write: write to .tmp then rename; set 0o600 permissions. */
export function writeVault(data: VaultData, vaultPath = getVaultPath()): void {
  const dir = path.dirname(vaultPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = `${vaultPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });

  // Set permissions explicitly after write (covers umask edge cases)
  if (process.platform !== "win32") {
    fs.chmodSync(tmp, 0o600);
  }

  fs.renameSync(tmp, vaultPath);

  if (process.platform !== "win32") {
    fs.chmodSync(vaultPath, 0o600);
  }
}

// ── Crypto ─────────────────────────────────────────────────────────────────

/** Encrypt a plaintext value with a master password. Returns EncryptedEntry. */
export function encrypt(value: string, password: string): EncryptedEntry {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  return {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

/** Decrypt an EncryptedEntry with the master password. Throws on wrong password. */
export function decrypt(entry: EncryptedEntry, password: string): string {
  const salt = Buffer.from(entry.salt, "hex");
  const key = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  const iv = Buffer.from(entry.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(entry.data, "hex")),
    decipher.final(), // throws ERR_OSSL_BAD_DECRYPT on wrong password
  ]);
  return decrypted.toString("utf-8");
}

// ── Master password prompt ─────────────────────────────────────────────────

/** Prompt for master password (cached per session). Throws if user cancels. */
export async function getMasterPassword(confirm = false): Promise<string> {
  if (_cachedPassword) return _cachedPassword;

  const password = await p.password({
    message: "Enter vault master password:",
    validate: (v) => (v.length < 8 ? "Password must be at least 8 characters" : undefined),
  });

  if (p.isCancel(password)) {
    p.cancel("Vault access cancelled.");
    process.exit(0);
  }

  if (confirm) {
    const confirm2 = await p.password({ message: "Confirm master password:" });
    if (p.isCancel(confirm2) || confirm2 !== password) {
      p.cancel("Passwords do not match.");
      process.exit(1);
    }
  }

  _cachedPassword = password as string;
  return _cachedPassword;
}

/** Clear cached password (for testing). */
export function clearPasswordCache(): void {
  _cachedPassword = null;
}

// ── CRUD operations ────────────────────────────────────────────────────────

/** Store an encrypted secret for server/key. */
export function setSecret(
  server: string,
  key: string,
  value: string,
  password: string,
  vaultPath = getVaultPath()
): void {
  const vault = readVault(vaultPath);
  if (!vault.servers[server]) vault.servers[server] = {};
  vault.servers[server][key] = encrypt(value, password);
  writeVault(vault, vaultPath);
}

/** Retrieve and decrypt a secret. Returns null if not found. */
export function getSecret(
  server: string,
  key: string,
  password: string,
  vaultPath = getVaultPath()
): string | null {
  const vault = readVault(vaultPath);
  const entry = vault.servers[server]?.[key];
  if (!entry) return null;
  return decrypt(entry, password);
}

/** Decrypt all secrets for a server. Returns empty record if server not found. */
export function getSecretsForServer(
  server: string,
  password: string,
  vaultPath = getVaultPath()
): Record<string, string> {
  const vault = readVault(vaultPath);
  const entries = vault.servers[server];
  if (!entries) return {};
  const result: Record<string, string> = {};
  for (const [k, entry] of Object.entries(entries)) {
    result[k] = decrypt(entry, password);
  }
  return result;
}

/** Remove a specific secret. No-op if not found. */
export function removeSecret(
  server: string,
  key: string,
  vaultPath = getVaultPath()
): void {
  const vault = readVault(vaultPath);
  if (vault.servers[server]) {
    delete vault.servers[server][key];
    if (Object.keys(vault.servers[server]).length === 0) {
      delete vault.servers[server];
    }
    writeVault(vault, vaultPath);
  }
}

/** List servers (and their key names) without decryption. */
export function listSecrets(
  server?: string,
  vaultPath = getVaultPath()
): Array<{ server: string; keys: string[] }> {
  const vault = readVault(vaultPath);
  const entries = server
    ? vault.servers[server]
      ? { [server]: vault.servers[server] }
      : {}
    : vault.servers;
  return Object.entries(entries).map(([srv, keys]) => ({
    server: srv,
    keys: Object.keys(keys),
  }));
}
