/**
 * doctor-checks — Pillar 17 secrets domain doctor integration.
 *
 * Issue 02: doctor reports `keyring: degraded` (warn) when native unavailable
 * — never `fail`. Native present → pass.
 *
 * Issue 18: vaultHealthCheck — when vault-integration flag ON and Vault
 * credentials are configured, checks reachability. Vault unreachable with
 * vault credentials present → `fail` with recovery hint.
 *
 * The Pillar 14 doctor aggregator imports `keyringHealthCheck` and registers it
 * the same way db/doctor-checks.ts will be registered.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/18-gated-vault-integration.md
 */

import {
  loadOrCreateMasterKey,
  KeyringStatus,
  type KeyringConfig,
} from "./keyring.ts";
import { isVaultIntegrationEnabled } from "./vault-adapter.ts";

export interface DoctorCheckResult {
  check: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  hint?: string;
}

// ---------------------------------------------------------------------------
// Vault health check (Issue 18)
// ---------------------------------------------------------------------------

export interface VaultHealthCheckOptions {
  /** Inject custom fetch for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * vaultHealthCheck — checks platform.keyring.vault (Issue 18).
 *
 * Only meaningful when `vault-integration` flag is ON AND
 * FULCRUM_VAULT_ADDR + FULCRUM_VAULT_TOKEN are set.
 *
 * Vault unreachable + vault credentials configured → status='fail'.
 * Vault reachable → status='pass'.
 * Flag OFF or no vault env vars → status='pass' (not applicable).
 */
export async function vaultHealthCheck(
  opts: VaultHealthCheckOptions = {},
): Promise<DoctorCheckResult> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const addr = process.env["FULCRUM_VAULT_ADDR"];
  const token = process.env["FULCRUM_VAULT_TOKEN"];

  if (!isVaultIntegrationEnabled() || !addr || !token) {
    return {
      check: "platform.keyring.vault",
      status: "pass",
      detail: "Vault integration not active (flag OFF or env vars unset).",
    };
  }

  const healthUrl = `${addr.replace(/\/$/, "")}/v1/sys/health`;
  try {
    const res = await fetchFn(healthUrl, {
      headers: { "X-Vault-Token": token },
    });
    if (res.ok || res.status === 429 || res.status === 472 || res.status === 473) {
      // Vault returns non-200 codes for standby/sealed but is still reachable
      return {
        check: "platform.keyring.vault",
        status: "pass",
        detail: `Vault reachable at ${addr} (HTTP ${res.status}).`,
      };
    }
    return {
      check: "platform.keyring.vault",
      status: "fail",
      detail: `Vault health check returned HTTP ${res.status} at ${addr}.`,
      hint: "Verify FULCRUM_VAULT_ADDR and FULCRUM_VAULT_TOKEN are correct, and Vault is unsealed.",
    };
  } catch (e) {
    return {
      check: "platform.keyring.vault",
      status: "fail",
      detail: `Vault unreachable at ${addr}: ${e instanceof Error ? e.message : String(e)}`,
      hint:
        "Ensure Vault is running and FULCRUM_VAULT_ADDR is reachable. Credentials with provider='vault' will not be accessible.",
    };
  }
}

// ---------------------------------------------------------------------------
// Keyring health check (Issue 02)
// ---------------------------------------------------------------------------

export async function keyringHealthCheck(
  cfg: KeyringConfig = {},
): Promise<DoctorCheckResult> {
  try {
    const r = await loadOrCreateMasterKey(cfg);
    if (r.status === KeyringStatus.OS) {
      return {
        check: "secrets.keyring",
        status: "pass",
        detail: "Master key resolved from OS keyring (source=os).",
      };
    }
    return {
      check: "secrets.keyring",
      status: "warn",
      detail:
        "Master key resolved from encrypted-file fallback (degraded — OS keyring unavailable).",
      hint:
        "Install node-keytar and ensure the OS keyring service is reachable for full hardening.",
    };
  } catch (e) {
    return {
      check: "secrets.keyring",
      status: "warn",
      detail: `Master key unavailable (degraded): ${
        e instanceof Error ? e.message : String(e)
      }`,
      hint:
        "Run any credential-using procedure to seed the fallback key, or configure the OS keyring.",
    };
  }
}
