import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createTenantSettingRepository } from "./tenant-settings.ts";
import type { ProductDb } from "./db/types.ts";

describe("TenantSettingRepository", () => {
  let db: ProductDb;
  let orgId: string;

  beforeEach(async () => {
    db = await openPglite("memory://tenant-settings-test");
    await runMigrations(db);
    // seed a default org
    await db.query(
      `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      ["org-test-1", "default", "Test Org"],
    );
    orgId = "org-test-1";
  });

  afterEach(async () => {
    await db.close();
  });

  it("getValue returns null for missing key", async () => {
    const repo = createTenantSettingRepository(db);
    const val = await repo.getValue(orgId, "nonexistent");
    expect(val).toBeNull();
  });

  it("migration schema includes repository-written id column", async () => {
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_settings'`,
    );
    expect(columns.map((row) => row.column_name)).toContain("id");
  });

  it("upsertValue inserts then retrieves", async () => {
    const repo = createTenantSettingRepository(db);
    await repo.upsertValue(orgId, "web.locale", "ar");
    const val = await repo.getValue(orgId, "web.locale");
    expect(val).toBe("ar");
  });

  it("upsertValue overwrites existing value", async () => {
    const repo = createTenantSettingRepository(db);
    await repo.upsertValue(orgId, "web.locale", "ar");
    await repo.upsertValue(orgId, "web.locale", "fr");
    const val = await repo.getValue(orgId, "web.locale");
    expect(val).toBe("fr");
  });

  it("different orgs have independent settings", async () => {
    await db.query(
      `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
      ["org-test-2", "other", "Other Org"],
    );
    const repo = createTenantSettingRepository(db);
    await repo.upsertValue(orgId, "web.locale", "ar");
    await repo.upsertValue("org-test-2", "web.locale", "fr");
    expect(await repo.getValue(orgId, "web.locale")).toBe("ar");
    expect(await repo.getValue("org-test-2", "web.locale")).toBe("fr");
  });
});
