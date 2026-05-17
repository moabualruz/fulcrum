import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

// --- Tenant Settings ---

export interface TenantSettingRow {
  id: string;
  org_id: string;
  key: string;
  value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function upsertTenantSetting(
  db: ProductDb,
  input: { orgId: string; key: string; value: Record<string, unknown> },
): Promise<TenantSettingRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO tenant_settings (id, org_id, key, value)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (org_id, key) DO UPDATE SET value = $4::jsonb, updated_at = now()`,
    [id, input.orgId, input.key, JSON.stringify(input.value)],
  );
  const rows = await db.query<TenantSettingRow>(
    `SELECT * FROM tenant_settings WHERE org_id = $1 AND key = $2`,
    [input.orgId, input.key],
  );
  return rows[0] as TenantSettingRow;
}

export async function getTenantSetting(
  db: ProductDb,
  orgId: string,
  key: string,
): Promise<TenantSettingRow | null> {
  const rows = await db.query<TenantSettingRow>(
    `SELECT * FROM tenant_settings WHERE org_id = $1 AND key = $2`,
    [orgId, key],
  );
  return rows.length > 0 ? (rows[0] as TenantSettingRow) : null;
}

export async function listTenantSettings(
  db: ProductDb,
  orgId: string,
): Promise<TenantSettingRow[]> {
  return db.query<TenantSettingRow>(
    `SELECT * FROM tenant_settings WHERE org_id = $1 ORDER BY key`,
    [orgId],
  );
}

// --- Connector Runs ---

export interface ConnectorRunRow {
  id: string;
  org_id: string;
  kind: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  error: string | null;
  records_synced: number;
}

export async function createConnectorRun(
  db: ProductDb,
  input: { orgId: string; kind: string },
): Promise<ConnectorRunRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO connector_runs (id, org_id, kind, status) VALUES ($1, $2, $3, 'pending')`,
    [id, input.orgId, input.kind],
  );
  const rows = await db.query<ConnectorRunRow>(
    `SELECT * FROM connector_runs WHERE id = $1`,
    [id],
  );
  return rows[0] as ConnectorRunRow;
}

export async function completeConnectorRun(
  db: ProductDb,
  runId: string,
  result: { status: "succeeded" | "failed"; recordsSynced?: number; error?: string },
): Promise<ConnectorRunRow> {
  await db.query(
    `UPDATE connector_runs SET status = $1, ended_at = now(), records_synced = $2, error = $3
     WHERE id = $4`,
    [result.status, result.recordsSynced ?? 0, result.error ?? null, runId],
  );
  const rows = await db.query<ConnectorRunRow>(
    `SELECT * FROM connector_runs WHERE id = $1`,
    [runId],
  );
  return rows[0] as ConnectorRunRow;
}

export async function listConnectorRuns(
  db: ProductDb,
  orgId: string,
  kind: string,
  limit: number = 10,
): Promise<ConnectorRunRow[]> {
  return db.query<ConnectorRunRow>(
    `SELECT * FROM connector_runs WHERE org_id = $1 AND kind = $2
     ORDER BY started_at DESC LIMIT $3`,
    [orgId, kind, limit],
  );
}

// --- Credentials ---

export interface CredentialRow {
  id: string;
  org_id: string;
  key: string;
  encrypted_value: string;
  created_at: string;
  updated_at: string;
}

export async function createCredential(
  db: ProductDb,
  input: { orgId: string; key: string; encryptedValue: string },
): Promise<CredentialRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO credentials (id, org_id, key, encrypted_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, key) DO UPDATE SET encrypted_value = $4, updated_at = now()`,
    [id, input.orgId, input.key, input.encryptedValue],
  );
  const rows = await db.query<CredentialRow>(
    `SELECT * FROM credentials WHERE org_id = $1 AND key = $2`,
    [input.orgId, input.key],
  );
  return rows[0] as CredentialRow;
}

export async function listCredentials(
  db: ProductDb,
  orgId: string,
): Promise<CredentialRow[]> {
  return db.query<CredentialRow>(
    `SELECT * FROM credentials WHERE org_id = $1 ORDER BY key`,
    [orgId],
  );
}

export async function deleteCredential(
  db: ProductDb,
  orgId: string,
  key: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM credentials WHERE org_id = $1 AND key = $2 RETURNING id`,
    [orgId, key],
  );
  return rows.length > 0;
}
