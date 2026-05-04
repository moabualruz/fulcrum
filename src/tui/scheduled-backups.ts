/**
 * Scheduled backups cron picker.
 * Gated by FULCRUM_FEATURES=scheduled-backups.
 * Saves cron expression to tenant_settings.
 */

import { isFeatureEnabled } from "./feature-flags.ts";

export interface CronSaveResult {
  success: boolean;
  setting?: {
    key: string;
    value: string;
    store: string;
  };
  error?: string;
}

/** Validate 5-field cron expression (minute hour dom month dow). */
export function isValidCron(expr: string): boolean {
  if (!expr) return false;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  // Each field: number, *, */N, or N-M
  const fieldRe = /^(\*|(\d{1,2})([-/]\d{1,2})?|\*\/\d{1,2})$/;
  return fields.every((f) => fieldRe.test(f));
}

export class ScheduledBackupsPanel {
  private schedule: string | null = null;

  isCronPickerVisible(): boolean {
    return isFeatureEnabled("scheduled-backups");
  }

  setCronSchedule(expr: string): CronSaveResult {
    if (!isFeatureEnabled("scheduled-backups")) {
      return { success: false, error: "scheduled-backups feature not enabled" };
    }
    if (!isValidCron(expr)) {
      return { success: false, error: `invalid cron expression: ${expr}` };
    }
    this.schedule = expr;
    return {
      success: true,
      setting: {
        key: "backup_cron_schedule",
        value: expr,
        store: "tenant_settings",
      },
    };
  }

  getCronSchedule(): string | null {
    return this.schedule;
  }
}
