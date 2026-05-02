/**
 * doctor-checks — Pillar 17 secrets domain doctor integration.
 *
 * Issue 02: doctor reports `keyring: degraded` (warn) when native unavailable
 * — never `fail`. Native present → pass.
 *
 * The Pillar 14 doctor aggregator imports `keyringHealthCheck` and registers it
 * the same way db/doctor-checks.ts will be registered.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md
 */

import {
  loadOrCreateMasterKey,
  KeyringStatus,
  type KeyringConfig,
} from "./keyring.ts";

export interface DoctorCheckResult {
  check: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  hint?: string;
}

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
