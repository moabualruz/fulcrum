/**
 * graphile-worker recurring task: backups:scheduled
 * Gated by FULCRUM_FEATURES=scheduled-backups.
 *
 * Cron expression read from TenantSetting key `backup.cron` (default: 0 2 * * *).
 * Remote DSN read from TenantSetting key `backup.remote_dsn` or env FULCRUM_REMOTE_BACKUP_DSN.
 *
 * Flow:
 *   1. createLocalBackup()
 *   2. uploadBackup() with retry
 *   3. On success: emit backup_upload_succeeded + pruneLocalBackups()
 *   4. On failure: emit backup_upload_failed + mark doctor fail
 */

import { isEnvFeatureEnabled as isFeatureEnabled } from "@platform-core/application/feature-flags/registry.ts";
import { createLocalBackup } from "./runner.ts";
import { uploadBackup, pruneLocalBackups, makeBackupEvent, type RemoteAdapterOptions } from "./remote-adapters.ts";

export const TASK_NAME = "backups:scheduled";
export const DEFAULT_CRON = "0 2 * * *";

export interface TaskDeps {
  /** Remote DSN string (e.g. s3://bucket/prefix). */
  dsn: string;
  /** Adapter options (injected clients for testing). */
  adapterOpts?: RemoteAdapterOptions;
  /** Optional override for stateDir (backups dir). */
  stateDir?: string;
  /** Event emitter (injected for testing). */
  emitEvent?: (event: { kind: string; payload: Record<string, unknown> }) => Promise<void> | void;
  /** Doctor fail callback (injected for testing). */
  onDoctorFail?: (check: string, message: string) => void;
}

/**
 * Execute the scheduled backup task.
 * Returns true on success, false on failure (after retries).
 */
export async function runScheduledBackup(deps: TaskDeps): Promise<boolean> {
  if (!isFeatureEnabled("scheduled-backups")) {
    return false;
  }

  const { archivePath } = await createLocalBackup({ stateDir: deps.stateDir });
  const result = await uploadBackup(archivePath, deps.dsn, deps.adapterOpts ?? {});
  const event = makeBackupEvent(result);

  if (deps.emitEvent) {
    await deps.emitEvent({ kind: event.kind, payload: event.payload });
  }

  if (!result.success) {
    if (deps.onDoctorFail) {
      deps.onDoctorFail("platform.remote_backup", result.error ?? "upload failed");
    }
    return false;
  }

  // Prune local copies after successful remote upload
  if (deps.stateDir) {
    await pruneLocalBackups(deps.stateDir);
  }
  return true;
}

/**
 * Returns whether the graphile-worker task should be registered.
 * Flag OFF → false; Flag ON → true.
 */
export function shouldRegisterTask(): boolean {
  return isFeatureEnabled("scheduled-backups");
}
