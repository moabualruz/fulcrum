import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  addSettingsSecret,
  clearSettingsErrors,
  createSettingsBackup,
  deleteSettingsSecret,
  importSettingsData,
  preflightSettingsBackup,
  preflightSettingsDataImport,
  purgeSettingsTelemetry,
  restoreSettingsBackup,
  rotateSettingsSecret,
  setSettingsFeatureFlagCohortRules,
  setSettingsFeatureFlagRollout,
  setTenantSetting,
  toggleSettingsFeatureFlag,
  toggleSettingsSecretArchive,
  toggleSettingsTelemetryOptIn,
} from "@platform-core/application/settings/commands.ts";
import {
  getSettingsTelemetry,
  getTenantSetting,
  listBackupSummaries,
  listSettingsErrors,
  listSettingsFeatureFlags,
  listSettingsSecrets,
} from "@platform-core/application/settings/queries.ts";
import type { AppContext } from "@platform-core/domain/settings.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function ctx(userId: string): AppContext {
  return { orgId: DEFAULT_ORG_ID, userId };
}

describe("settings commands and queries with migrated PGlite data", () => {
  test("feature flags, backups, secrets, errors, telemetry, and import helpers persist real rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const userId = testDb.seed.userId;
    const appCtx = ctx(userId);

    const setting = await setTenantSetting(em, appCtx, { key: "settings.integration", value: { enabled: true } });
    expect(setting).toMatchObject({ key: "settings.integration", value: { enabled: true } });
    await expect(getTenantSetting(em, appCtx, "settings.integration")).resolves.toMatchObject({ value: { enabled: true } });

    const flagsBefore = await listSettingsFeatureFlags(em, appCtx);
    const flag = flagsBefore.flags.find((row) => row.name === "settings.integration")!;
    expect(flag.enabled).toBe(true);
    await toggleSettingsFeatureFlag(em, appCtx, { id: flag.id });
    await setSettingsFeatureFlagRollout(em, appCtx, { id: flag.id, rolloutPercent: 25 });
    await setSettingsFeatureFlagCohortRules(em, appCtx, { id: flag.id, rules: { plan: "team" } });
    const flagsAfter = await listSettingsFeatureFlags(em, appCtx);
    expect(flagsAfter.flags.find((row) => row.id === flag.id)).toMatchObject({
      enabled: false,
      rollout_percent: 25,
      cohort_rules: { plan: "team" },
    });

    const backup = await createSettingsBackup(em, appCtx);
    expect(backup.success).toBe(true);
    expect((await listBackupSummaries(em, appCtx)).backups[0]).toMatchObject({ id: backup.id, status: "complete" });
    expect(preflightSettingsBackup({ projects: [{ id: "p1" }], tasks: [{ id: "t1" }, { id: "t2" }] })).toEqual({
      preflight: true,
      entityCounts: { projects: 1, tasks: 2 },
    });

    await expect(restoreSettingsBackup(em, appCtx, { manifest: null })).resolves.toMatchObject({ restored: true });
    expect(preflightSettingsDataImport({ format: "fulcrum.json-export.v1", tasks: [{ id: "t1" }] })).toEqual({
      preflightSummary: { tasks: 1 },
    });
    await expect(importSettingsData(em, appCtx, { tasks: [{ id: "t1" }], credentials: [] })).resolves.toEqual({
      imported: true,
      totalRows: 1,
    });

    await addSettingsSecret(em, appCtx, { name: "OPENAI_API_KEY", value: "secret-one", provider: "local" });
    let secrets = await listSettingsSecrets(em, appCtx);
    expect(secrets.credentials).toMatchObject([{ name: "OPENAI_API_KEY", provider: "local", archived: false }]);
    const secretId = secrets.credentials[0]!.id;
    await rotateSettingsSecret(em, appCtx, { id: secretId, value: "secret-two" });
    await toggleSettingsSecretArchive(em, appCtx, { id: secretId });
    secrets = await listSettingsSecrets(em, appCtx);
    expect(secrets.credentials[0]).toMatchObject({ id: secretId, archived: true });
    expect(secrets.credentials[0]!.last_used_at).not.toBeNull();
    await deleteSettingsSecret(em, appCtx, { id: secretId });
    expect((await listSettingsSecrets(em, appCtx)).credentials).toHaveLength(0);

    await em.getConnection().execute(
      `INSERT INTO error_logs (org_id, user_id, error_message, stack_trace, context, environment, app_version, occurred_at)
       VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?),
              (?, ?, ?, ?, ?::jsonb, ?, ?, ?)`,
      [
        DEFAULT_ORG_ID,
        userId,
        "old failure",
        "stack",
        JSON.stringify({ route: "/settings" }),
        "darwin",
        "1.0.0",
        "2026-05-01T00:00:00Z",
        DEFAULT_ORG_ID,
        userId,
        "new failure",
        null,
        JSON.stringify({ route: "/settings/secrets" }),
        "darwin",
        "1.0.1",
        "2026-05-10T00:00:00Z",
      ],
    );
    expect(await listSettingsErrors(em, appCtx, { page: 1, pageSize: 10 })).toMatchObject({
      total: 2,
      errors: [{ message: "new failure" }, { message: "old failure" }],
    });
    await clearSettingsErrors(em, appCtx, { before: "2026-05-05T00:00:00Z" });
    expect(await listSettingsErrors(em, appCtx, { page: 1, pageSize: 10 })).toMatchObject({
      total: 1,
      errors: [{ message: "new failure" }],
    });

    expect(await getSettingsTelemetry(em, appCtx)).toEqual({ optIn: false, rowCount: 0 });
    await toggleSettingsTelemetryOptIn(em, appCtx);
    await em.getConnection().execute(
      `INSERT INTO telemetry_events (org_id, user_id, kind, payload, occurred_at)
       VALUES (?, ?, ?, ?::jsonb, now())`,
      [DEFAULT_ORG_ID, userId, "settings.changed", JSON.stringify({ kind: "flag" })],
    );
    expect(await getSettingsTelemetry(em, appCtx)).toEqual({ optIn: true, rowCount: 1 });
    await expect(purgeSettingsTelemetry(em, appCtx)).resolves.toEqual({ success: true, rowCount: 0 });
    expect(await getSettingsTelemetry(em, appCtx)).toEqual({ optIn: true, rowCount: 0 });
  });
});
