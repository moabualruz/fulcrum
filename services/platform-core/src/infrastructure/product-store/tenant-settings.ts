import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

export interface TenantSettingRepository {
  getValue(orgId: string, key: string): Promise<string | null>;
  upsertValue(orgId: string, key: string, value: string): Promise<void>;
}

export function createTenantSettingRepository(db: ProductDb): TenantSettingRepository {
  return {
    async getValue(orgId, key) {
      const rows = await db.query<{ value: unknown }>(
        `SELECT value FROM tenant_settings WHERE org_id = $1 AND key = $2`,
        [orgId, key],
      );
      const value = rows[0]?.value;
      if (value == null) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async upsertValue(orgId, key, value) {
      await db.query(
        `INSERT INTO tenant_settings (id, org_id, key, value, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (org_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [newUlid(), orgId, key, JSON.stringify(value)],
      );
    },
  };
}
