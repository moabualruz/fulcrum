import { describe, expect, test, afterEach } from "bun:test";
import {
  ScheduledBackupsPanel,
  isValidCron,
} from "./scheduled-backups.ts";

describe("ScheduledBackupsPanel", () => {
  afterEach(() => {
    delete process.env["FULCRUM_FEATURES"];
  });

  test("cron picker hidden when scheduled-backups OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new ScheduledBackupsPanel();
    expect(panel.isCronPickerVisible()).toBe(false);
  });

  test("cron picker visible when scheduled-backups ON", () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    const panel = new ScheduledBackupsPanel();
    expect(panel.isCronPickerVisible()).toBe(true);
  });

  test("cron expression saves to tenant_settings", () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    const panel = new ScheduledBackupsPanel();
    const result = panel.setCronSchedule("0 2 * * *");
    expect(result.success).toBe(true);
    expect(result.setting).toEqual({
      key: "backup_cron_schedule",
      value: "0 2 * * *",
      store: "tenant_settings",
    });
  });

  test("getCronSchedule returns current schedule", () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    const panel = new ScheduledBackupsPanel();
    panel.setCronSchedule("30 3 * * 0");
    expect(panel.getCronSchedule()).toBe("30 3 * * 0");
  });

  test("rejects invalid cron expression", () => {
    process.env["FULCRUM_FEATURES"] = "scheduled-backups";
    const panel = new ScheduledBackupsPanel();
    const result = panel.setCronSchedule("not-a-cron");
    expect(result.success).toBe(false);
  });

  test("no-op when flag OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const panel = new ScheduledBackupsPanel();
    const result = panel.setCronSchedule("0 2 * * *");
    expect(result.success).toBe(false);
  });
});

describe("isValidCron", () => {
  test("valid 5-field cron", () => {
    expect(isValidCron("0 2 * * *")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("30 3 * * 0")).toBe(true);
  });

  test("invalid cron", () => {
    expect(isValidCron("not-a-cron")).toBe(false);
    expect(isValidCron("")).toBe(false);
    expect(isValidCron("1 2 3")).toBe(false); // too few fields
  });
});
