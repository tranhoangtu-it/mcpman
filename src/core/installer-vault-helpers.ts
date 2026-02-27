/**
 * installer-vault-helpers.ts
 * Vault integration helpers for the install command.
 * Kept separate to keep installer.ts under 200 lines.
 */

import * as p from "@clack/prompts";
import {
  getSecretsForServer,
  getMasterPassword,
  setSecret,
  listSecrets,
} from "./vault-service.js";

/**
 * Silently attempt to load vault secrets for a server.
 * Returns {} on any error (missing vault, wrong password, corrupt data).
 * Only prompts for master password if the server has vault entries.
 */
export async function tryLoadVaultSecrets(
  serverName: string
): Promise<Record<string, string>> {
  try {
    // Check if server has any secrets before prompting for password
    const entries = listSecrets(serverName);
    if (entries.length === 0 || entries[0].keys.length === 0) {
      return {};
    }

    // Server has vault secrets — get password (cached per session) and decrypt
    const password = await getMasterPassword();
    return getSecretsForServer(serverName, password);
  } catch {
    // Any error (wrong password, corrupt vault, missing file) → silent fallback
    return {};
  }
}

/**
 * After successful install, offer to save newly entered env vars to vault.
 * Skips silently if: no new vars, yes mode, or user declines.
 */
export async function offerVaultSave(
  serverName: string,
  newVars: Record<string, string>,
  yes: boolean
): Promise<void> {
  // Nothing to save
  if (Object.keys(newVars).length === 0) return;

  // Non-interactive mode — skip vault save offer
  if (yes) return;

  try {
    const save = await p.confirm({
      message: `Save ${Object.keys(newVars).length} env var(s) to encrypted vault for future installs?`,
    });

    if (p.isCancel(save) || !save) return;

    const password = await getMasterPassword();
    for (const [key, value] of Object.entries(newVars)) {
      setSecret(serverName, key, value, password);
    }

    p.log.success(`Credentials saved to vault for '${serverName}'`);
  } catch (err) {
    // Vault save is non-fatal — warn and continue
    p.log.warn(`Could not save to vault: ${err instanceof Error ? err.message : String(err)}`);
  }
}
