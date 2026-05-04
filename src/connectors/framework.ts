/**
 * Connector framework — abstract base for external-system adapters.
 *
 * Each connector extends ConnectorBase, implements fetch(), and is registered
 * with a feature-flag name. The framework handles idempotent upsert on
 * (org_id, external_id), sync-log bookkeeping, and flag guards.
 */

import type { ProductDb } from "../product-kernel/db/types.ts";
import { newUlid } from "../product-kernel/ids.ts";

// ---------------------------------------------------------------------------
// UpsertTaskInput — the shape each connector's fetch() returns per item
// ---------------------------------------------------------------------------

export interface UpsertTaskInput {
  external_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: number;
  labels?: string[];
  assignee?: string | null;
  sprint_external_id?: string | null;
  sprint_title?: string | null;
  sprint_start_date?: string | null;
  sprint_end_date?: string | null;
}

// ---------------------------------------------------------------------------
// Feature-flag helper
// ---------------------------------------------------------------------------

export function isFeatureEnabled(flag: string): boolean {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(flag);
}

// ---------------------------------------------------------------------------
// ConnectorBase
// ---------------------------------------------------------------------------

export abstract class ConnectorBase {
  abstract readonly name: string;
  abstract readonly flag: string;

  /**
   * Pull items from the external system. Implementations must handle
   * pagination, auth, and field mapping internally.
   */
  abstract fetch(): Promise<UpsertTaskInput[]>;
}

// ---------------------------------------------------------------------------
// Sync-log helpers
// ---------------------------------------------------------------------------

export interface SyncLogRow {
  id: string;
  org_id: string;
  connector: string;
  status: string;
  items_imported: number;
  items_updated: number;
  errors: number;
  last_run_at: string;
  error: string | null;
  created_at: string;
}

async function writeSyncLog(
  db: ProductDb,
  orgId: string,
  connector: string,
  status: "running" | "succeeded" | "failed",
  stats: { imported: number; updated: number; errors: number },
  error?: string | null,
): Promise<SyncLogRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO connector_sync_log
       (id, org_id, connector, status, items_imported, items_updated, errors, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, orgId, connector, status, stats.imported, stats.updated, stats.errors, error ?? null],
  );
  const rows = await db.query<SyncLogRow>(
    `SELECT * FROM connector_sync_log WHERE id = $1`,
    [id],
  );
  return rows[0] as SyncLogRow;
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

async function ensureLabel(
  db: ProductDb,
  orgId: string,
  projectId: string | null,
  name: string,
): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM labels WHERE org_id = $1 AND project_id IS NOT DISTINCT FROM $2 AND name = $3`,
    [orgId, projectId, name],
  );
  if (existing[0]) return existing[0].id;
  const id = newUlid();
  await db.query(
    `INSERT INTO labels (id, org_id, project_id, name) VALUES ($1, $2, $3, $4)`,
    [id, orgId, projectId, name],
  );
  return id;
}

async function setTaskLabels(
  db: ProductDb,
  taskId: string,
  labelIds: string[],
): Promise<void> {
  await db.query(`DELETE FROM task_labels WHERE task_id = $1`, [taskId]);
  for (const labelId of labelIds) {
    await db.query(
      `INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)`,
      [taskId, labelId],
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint helpers
// ---------------------------------------------------------------------------

async function ensureSprint(
  db: ProductDb,
  orgId: string,
  projectId: string | null,
  input: {
    external_id: string;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
  },
): Promise<string> {
  // Match by external_id first.
  const byExt = await db.query<{ id: string }>(
    `SELECT id FROM sprints WHERE org_id = $1 AND external_id = $2`,
    [orgId, input.external_id],
  );
  if (byExt[0]) return byExt[0].id;

  // Match by title.
  const byTitle = await db.query<{ id: string }>(
    `SELECT id FROM sprints WHERE org_id = $1 AND title = $2`,
    [orgId, input.title],
  );
  if (byTitle[0]) {
    // Backfill external_id.
    await db.query(
      `UPDATE sprints SET external_id = $1, updated_at = now() WHERE id = $2`,
      [input.external_id, byTitle[0].id],
    );
    return byTitle[0].id;
  }

  const id = newUlid();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, title, start_date, end_date, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      orgId,
      projectId,
      input.title,
      input.start_date ?? null,
      input.end_date ?? null,
      input.external_id,
    ],
  );
  return id;
}

// ---------------------------------------------------------------------------
// GitHub status → Fulcrum status mapping
// ---------------------------------------------------------------------------

export function mapGitHubStatus(ghState: string): string {
  switch (ghState) {
    case "open":
      return "pending";
    case "closed":
      return "completed";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// runConnectorJob — the main sync orchestrator
// ---------------------------------------------------------------------------

export interface SyncResult {
  imported: number;
  updated: number;
  errors: number;
}

export async function runConnectorJob(
  db: ProductDb,
  connector: ConnectorBase,
  orgId: string,
  projectId?: string | null,
): Promise<SyncResult> {
  if (!isFeatureEnabled(connector.flag)) {
    throw new Error(`Feature flag "${connector.flag}" is not enabled`);
  }

  await writeSyncLog(db, orgId, connector.name, "running", {
    imported: 0,
    updated: 0,
    errors: 0,
  });

  let imported = 0;
  let updated = 0;
  let errors = 0;

  try {
    const items = await connector.fetch();

    for (const item of items) {
      try {
        // Check if task exists by external_id.
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM tasks WHERE org_id = $1 AND external_id = $2`,
          [orgId, item.external_id],
        );

        let taskId: string;

        if (existing[0]) {
          // Update existing task.
          taskId = existing[0].id;
          await db.query(
            `UPDATE tasks SET
               title = $1,
               description = $2,
               status = $3,
               priority = $4,
               assignee = $5,
               sprint_id = $6,
               updated_at = now()
             WHERE id = $7`,
            [
              item.title,
              item.description ?? null,
              item.status,
              item.priority ?? 0,
              item.assignee ?? null,
              item.sprint_external_id
                ? (
                    await ensureSprint(db, orgId, projectId ?? null, {
                      external_id: item.sprint_external_id,
                      title: item.sprint_title ?? item.sprint_external_id,
                      start_date: item.sprint_start_date,
                      end_date: item.sprint_end_date,
                    })
                  )
                : null,
              taskId,
            ],
          );
          updated++;
        } else {
          // Insert new task.
          taskId = newUlid();
          const sprintId = item.sprint_external_id
            ? await ensureSprint(db, orgId, projectId ?? null, {
                external_id: item.sprint_external_id,
                title: item.sprint_title ?? item.sprint_external_id,
                start_date: item.sprint_start_date,
                end_date: item.sprint_end_date,
              })
            : null;

          await db.query(
            `INSERT INTO tasks
               (id, org_id, project_id, title, description, status, priority, external_id, assignee, sprint_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              taskId,
              orgId,
              projectId ?? null,
              item.title,
              item.description ?? null,
              item.status,
              item.priority ?? 0,
              item.external_id,
              item.assignee ?? null,
              sprintId,
            ],
          );
          imported++;
        }

        // Handle labels.
        if (item.labels && item.labels.length > 0) {
          const labelIds: string[] = [];
          for (const labelName of item.labels) {
            const labelId = await ensureLabel(db, orgId, projectId ?? null, labelName);
            labelIds.push(labelId);
          }
          await setTaskLabels(db, taskId, labelIds);
        }
      } catch (e) {
        errors++;
      }
    }

    await writeSyncLog(db, orgId, connector.name, "succeeded", {
      imported,
      updated,
      errors,
    });
  } catch (e) {
    await writeSyncLog(db, orgId, connector.name, "failed", {
      imported,
      updated,
      errors,
    }, e instanceof Error ? e.message : String(e));
    throw e;
  }

  return { imported, updated, errors };
}

// ---------------------------------------------------------------------------
// Doctor check
// ---------------------------------------------------------------------------

export interface ConnectorHealthRow {
  connector: string;
  last_run_at: string;
  status: string;
  error: string | null;
}

export async function doctorConnectorCheck(
  db: ProductDb,
  orgId: string,
): Promise<ConnectorHealthRow[]> {
  return db.query<ConnectorHealthRow>(
    `SELECT DISTINCT ON (connector)
       connector, last_run_at, status, error
     FROM connector_sync_log
     WHERE org_id = $1
     ORDER BY connector, last_run_at DESC`,
    [orgId],
  );
}
