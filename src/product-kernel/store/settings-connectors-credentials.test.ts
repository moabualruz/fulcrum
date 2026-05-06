import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import { createLocalOrg } from "./repositories.ts";
import {
  upsertTenantSetting,
  getTenantSetting,
  listTenantSettings,
  createConnectorRun,
  completeConnectorRun,
  listConnectorRuns,
  createCredential,
  listCredentials,
  deleteCredential,
  type TenantSettingRow,
  type ConnectorRunRow,
  type CredentialRow,
} from "./settings-connectors-credentials.ts";
import type { TestStore } from "../../test-support/product-fixtures.ts";

let db: TestStore;
let orgId: string;

beforeAll(async () => {
  db = await openIsolatedStore("memory://test-settings");
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "test-org", name: "Test Org" });
  orgId = org.id;
});

afterAll(async () => {
  await db.close();
});

describe("tenant_settings", () => {
  test("upsert + get round-trips", async () => {
    const row = await upsertTenantSetting(db, {
      orgId,
      key: "theme.preset",
      value: { name: "dark" },
    });
    expect(row.key).toBe("theme.preset");
    expect(row.value).toEqual({ name: "dark" });

    const fetched = await getTenantSetting(db, orgId, "theme.preset");
    expect(fetched).not.toBeNull();
    expect(fetched!.value).toEqual({ name: "dark" });
  });

  test("upsert overwrites existing", async () => {
    await upsertTenantSetting(db, { orgId, key: "theme.preset", value: { name: "monokai" } });
    const fetched = await getTenantSetting(db, orgId, "theme.preset");
    expect(fetched!.value).toEqual({ name: "monokai" });
  });

  test("get returns null for missing key", async () => {
    const fetched = await getTenantSetting(db, orgId, "nonexistent.key");
    expect(fetched).toBeNull();
  });

  test("list returns all settings for org", async () => {
    await upsertTenantSetting(db, { orgId, key: "other.setting", value: { enabled: true } });
    const all = await listTenantSettings(db, orgId);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const keys = all.map((r) => r.key);
    expect(keys).toContain("theme.preset");
    expect(keys).toContain("other.setting");
  });
});

describe("connector_runs", () => {
  test("create run in pending state", async () => {
    const run = await createConnectorRun(db, { orgId, kind: "github" });
    expect(run.kind).toBe("github");
    expect(run.status).toBe("pending");
    expect(run.ended_at).toBeNull();
  });

  test("complete run with success", async () => {
    const run = await createConnectorRun(db, { orgId, kind: "github" });
    const completed = await completeConnectorRun(db, run.id, {
      status: "succeeded",
      recordsSynced: 42,
    });
    expect(completed.status).toBe("succeeded");
    expect(completed.records_synced).toBe(42);
    expect(completed.ended_at).not.toBeNull();
  });

  test("complete run with failure", async () => {
    const run = await createConnectorRun(db, { orgId, kind: "jira" });
    const completed = await completeConnectorRun(db, run.id, {
      status: "failed",
      error: "Connection timeout",
    });
    expect(completed.status).toBe("failed");
    expect(completed.error).toBe("Connection timeout");
  });

  test("list runs by kind, ordered by started_at desc", async () => {
    const runs = await listConnectorRuns(db, orgId, "github", 10);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i - 1]!.started_at >= runs[i]!.started_at).toBe(true);
    }
  });
});

describe("credentials", () => {
  test("create + list", async () => {
    const cred = await createCredential(db, {
      orgId,
      key: "GITHUB_TOKEN",
      encryptedValue: "enc:abc123",
    });
    expect(cred.key).toBe("GITHUB_TOKEN");

    const all = await listCredentials(db, orgId);
    expect(all.some((c) => c.key === "GITHUB_TOKEN")).toBe(true);
    // Encrypted value returned (masking is presentation-layer concern)
    const found = all.find((c) => c.key === "GITHUB_TOKEN")!;
    expect(found.encrypted_value).toBe("enc:abc123");
  });

  test("delete credential", async () => {
    const cred = await createCredential(db, {
      orgId,
      key: "TEMP_SECRET",
      encryptedValue: "enc:xyz",
    });
    const deleted = await deleteCredential(db, orgId, "TEMP_SECRET");
    expect(deleted).toBe(true);

    const all = await listCredentials(db, orgId);
    expect(all.some((c) => c.key === "TEMP_SECRET")).toBe(false);
  });

  test("delete nonexistent returns false", async () => {
    const deleted = await deleteCredential(db, orgId, "DOES_NOT_EXIST");
    expect(deleted).toBe(false);
  });

  test("create duplicate key upserts", async () => {
    await createCredential(db, { orgId, key: "DUP_KEY", encryptedValue: "v1" });
    const updated = await createCredential(db, { orgId, key: "DUP_KEY", encryptedValue: "v2" });
    expect(updated.encrypted_value).toBe("v2");
    const all = await listCredentials(db, orgId);
    expect(all.filter((c) => c.key === "DUP_KEY").length).toBe(1);
  });
});
