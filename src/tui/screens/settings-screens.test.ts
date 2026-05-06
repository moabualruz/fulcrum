import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { openPglite } from "../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../product-kernel/store/repositories.ts";
import {
  upsertTenantSetting,
  createConnectorRun,
  completeConnectorRun,
  listConnectorRuns,
  createCredential,
  listCredentials,
  deleteCredential,
} from "../../product-kernel/store/settings-connectors-credentials.ts";
import type { ProductDb } from "../../product-kernel/db/types.ts";
import {
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

let db: ProductDb;
let orgId: string;

beforeAll(async () => {
  db = await openPglite("memory://test-tui-screens");
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "tui-test", name: "TUI Test" });
  orgId = org.id;
});

afterAll(async () => {
  await db.close();
});

// --- Connectors Screen ---

describe("ConnectorsScreen", () => {
  test("renders enabled connectors with last sync", async () => {
    const run = await createConnectorRun(db, { orgId, kind: "github" });
    await completeConnectorRun(db, run.id, { status: "succeeded", recordsSynced: 10 });

    const runs = await listConnectorRuns(db, orgId, "github", 10);
    const output = renderConnectorsScreen([
      { kind: "github", enabled: true, runs },
    ]);

    expect(output).toContain("github");
    expect(output).toContain("succeeded");
    expect(output).toContain("10");
  });

  test("shows 's' sync hint and run log", async () => {
    const runs = await listConnectorRuns(db, orgId, "github", 10);
    const output = renderConnectorsScreen([
      { kind: "github", enabled: true, runs },
    ]);
    expect(output).toContain("[s] Sync");
    expect(output).toContain("Run Log");
  });
});

// --- Theme Screen ---

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

// --- Secrets Screen ---

describe("SecretsScreen", () => {
  test("masks credential values", () => {
    expect(maskCredentialValue("supersecret")).toBe("•••• redacted");
    expect(maskCredentialValue("")).toBe("•••• redacted");
  });

  test("renders masked list with add/delete hints", async () => {
    await createCredential(db, { orgId, key: "API_KEY", encryptedValue: "enc:abc" });
    const creds = await listCredentials(db, orgId);
    const output = renderSecretsScreen(creds);

    expect(output).toContain("API_KEY");
    expect(output).toContain("••••");
    expect(output).toContain("redacted");
    expect(output).not.toContain("enc:abc");
    expect(output).toContain("[a] Add");
    expect(output).toContain("[d] Delete");
  });
});

// --- Backups Screen ---

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

// --- Doctor Screen ---

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
