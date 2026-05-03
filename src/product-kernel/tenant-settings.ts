import type { ProductDb } from "./db/types.ts";

export interface TenantSettingRepository {
  getValue(orgId: string, key: string): Promise<string | null>;
  upsertValue(orgId: string, key: string, value: string): Promise<void>;
}

export function createTenantSettingRepository(db: ProductDb): TenantSettingRepository {
  return {
    async getValue(orgId, key) {
      const rows = await db.query<{ value: string }>(
        `SELECT value FROM tenant_settings WHERE org_id = $1 AND key = $2`,
        [orgId, key],
      );
      return rows[0]?.value ?? null;
    },
    async upsertValue(orgId, key, value) {
      await db.query(
        `INSERT INTO tenant_settings (org_id, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (org_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [orgId, key, value],
      );
    },
  };
}
