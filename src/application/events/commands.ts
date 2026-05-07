import type { SqlExecutor } from "../../db/sql.ts";
import { newUlid } from "../../shared/ids.ts";

export interface SprintRetroDocInput {
  orgId: string;
  projectId: string;
  title: string;
  body: string;
  sprintId: string;
}

export interface EventHandlerPersistence {
  wasEventHandled(eventId: string, handler: string): Promise<boolean>;
  markEventHandled(eventId: string, handler: string): Promise<void>;
  insertSprintRetroDoc(input: SprintRetroDocInput): Promise<string>;
  setSprintRetroDocId(sprintId: string, docId: string): Promise<void>;
}

export function createSqlEventHandlerPersistence(db: SqlExecutor): EventHandlerPersistence {
  return {
    async wasEventHandled(eventId, handler) {
      const rows = await db.query<{ event_id: string }>(
        `SELECT event_id FROM event_handler_log WHERE event_id = $1 AND handler = $2`,
        [eventId, handler],
      );
      return rows.length > 0;
    },
    async markEventHandled(eventId, handler) {
      await db.query(
        `INSERT INTO event_handler_log (event_id, handler)
         VALUES ($1, $2)
         ON CONFLICT (event_id, handler) DO NOTHING`,
        [eventId, handler],
      );
    },
    async insertSprintRetroDoc(input) {
      const id = newUlid();
      await db.query(
        `INSERT INTO documents (id, org_id, project_id, kind, title, body, frontmatter)
         VALUES ($1, $2, $3, 'postmortem', $4, $5, $6::jsonb)`,
        [
          id,
          input.orgId,
          input.projectId,
          input.title,
          input.body,
          JSON.stringify({ sprint_id: input.sprintId }),
        ],
      );
      return id;
    },
    async setSprintRetroDocId(sprintId, docId) {
      const rows = await db.query<{ id: string }>(
        `UPDATE sprints SET retro_doc_id = $1, updated_at = now() WHERE id = $2 RETURNING id`,
        [docId, sprintId],
      );
      if (rows.length === 0) throw new Error(`sprint not found: ${sprintId}`);
    },
  };
}
