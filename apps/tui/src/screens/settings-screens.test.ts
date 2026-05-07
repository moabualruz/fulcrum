import { describe, expect, test } from "bun:test";
import {
  buildSettingsScreenData,
  renderConnectorsScreen,
  renderThemeScreen,
  renderSecretsScreen,
  renderBackupsScreen,
  renderDoctorScreen,
  THEME_PRESETS,
  cycleThemePreset,
  maskCredentialValue,
  type DoctorCheckResult,
} from "./settings-screens.ts";

describe("ConnectorsScreen", () => {
  test("data comes from caller fixture", async () => {
    const data = await buildSettingsScreenData({
      connectors: {
        list: async () => [{ kind: "github", enabled: true, lastSyncAt: "2026-05-01T00:00:00Z" }],
        runs: { list: async () => [{ kind: "github", status: "succeeded", startedAt: "2026-05-01T00:00:00Z", recordsSynced: 2 }] },
      },
      credentials: {
        list: async () => [{ key: "TOKEN", encryptedValue: "enc:test" }],
      },
    });

    expect(data.connectors[0]?.kind).toBe("github");
    expect(data.connectors[0]?.runs[0]?.status).toBe("succeeded");
    expect(data.credentials[0]?.key).toBe("TOKEN");
  });

  test("renders enabled connectors with last sync", () => {
    const output = renderConnectorsScreen([
      { kind: "github", enabled: true, runs: [{ kind: "github", status: "succeeded", startedAt: "2026-05-01", recordsSynced: 10 }] },
    ]);

    expect(output).toContain("github");
    expect(output).toContain("succeeded");
    expect(output).toContain("10");
  });

  test("shows 's' sync hint and run log", () => {
    const output = renderConnectorsScreen([
      { kind: "github", enabled: true, runs: [{ kind: "github", status: "succeeded", startedAt: "2026-05-01", recordsSynced: 10 }] },
    ]);
    expect(output).toContain("[s] Sync");
    expect(output).toContain("Run Log");
  });
});

describe("ThemeScreen", () => {
  test("has 5 built-in presets", () => {
    expect(THEME_PRESETS.length).toBe(5);
  });

  test("cycleThemePreset wraps around", () => {
    expect(cycleThemePreset(0)).toBe(1);
    expect(cycleThemePreset(4)).toBe(0);
  });

  test("renders preset name and preview", () => {
    const output = renderThemeScreen(0);
    expect(output).toContain(THEME_PRESETS[0]!.name);
    expect(output).toContain("[n] Next preset");
    expect(output).toContain("Preview");
  });
});

describe("SecretsScreen", () => {
  test("masks credential values", () => {
    expect(maskCredentialValue("supersecret")).toBe("•••• redacted");
    expect(maskCredentialValue("")).toBe("•••• redacted");
  });

  test("renders masked list with add/delete hints", () => {
    const output = renderSecretsScreen([{ key: "API_KEY", encryptedValue: "enc:abc" }]);

    expect(output).toContain("API_KEY");
    expect(output).toContain("••••");
    expect(output).toContain("redacted");
    expect(output).not.toContain("enc:abc");
    expect(output).toContain("[a] Add");
    expect(output).toContain("[d] Delete");
  });
});

describe("BackupsScreen", () => {
  test("renders backup and restore hints", () => {
    const output = renderBackupsScreen({ lastBackupPath: null });
    expect(output).toContain("[b] Backup");
    expect(output).toContain("Restore");
  });

  test("shows last backup path when available", () => {
    const output = renderBackupsScreen({ lastBackupPath: "/tmp/fulcrum-backup.tar.gz" });
    expect(output).toContain("/tmp/fulcrum-backup.tar.gz");
  });
});

describe("DoctorScreen", () => {
  test("renders check rows with status icons", () => {
    const checks: DoctorCheckResult[] = [
      { subsystem: "database", status: "pass", message: "Connected" },
      { subsystem: "migrations", status: "warn", message: "1 pending" },
      { subsystem: "search", status: "fail", message: "Index missing" },
    ];
    const output = renderDoctorScreen(checks);

    expect(output).toContain("database");
    expect(output).toContain("✓");
    expect(output).toContain("migrations");
    expect(output).toContain("⚠");
    expect(output).toContain("search");
    expect(output).toContain("✗");
  });

  test("shows pass/warn/fail counts in footer", () => {
    const checks: DoctorCheckResult[] = [
      { subsystem: "db", status: "pass", message: "OK" },
      { subsystem: "search", status: "pass", message: "OK" },
      { subsystem: "mig", status: "warn", message: "Pending" },
      { subsystem: "idx", status: "fail", message: "Missing" },
    ];
    const output = renderDoctorScreen(checks);
    expect(output).toContain("Pass: 2");
    expect(output).toContain("Warn: 1");
    expect(output).toContain("Fail: 1");
  });

  test("Enter hint for recovery guide on warn/fail", () => {
    const checks: DoctorCheckResult[] = [
      { subsystem: "search", status: "fail", message: "Index missing", recoveryGuide: "Run reindex" },
    ];
    const output = renderDoctorScreen(checks);
    expect(output).toContain("[Enter] Recovery guide");
  });
});
