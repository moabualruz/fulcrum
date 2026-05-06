import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { cancelRunAction, retryRunAction, type RunStatus } from "$lib/server/runs";
import { actionOk } from "$lib/feedback/action-result";

interface AgentRunDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
  status: RunStatus;
  symphony_state: string | null;
  parent_run_id: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
  transcript_path: string | null;
  last_error_kind: string | null;
  retry_count: number;
  workspace_path: string | null;
}

interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  actor: string;
  created_at: string | Date;
}

function isoStamp(value: string | Date): string;
function isoStamp(value: string | Date | null): string | null;
function isoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ params, locals }) => {
  return {
    projectId: params.id,
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await db.query<AgentRunDetail>(
            `SELECT id, org_id, project_id, agent, model, prompt, status,
                    symphony_state, parent_run_id, started_at, ended_at,
                    transcript_path, last_error_kind, retry_count, workspace_path
               FROM agent_runs WHERE id = $1 AND org_id = $2`,
            [params.runId, orgId],
          );
          if (rows.length === 0) throw error(404, "Run not found");
          const raw = rows[0]!;
          const run = {
            ...raw,
            started_at: isoStamp(raw.started_at),
            ended_at: isoStamp(raw.ended_at),
          };

          let transcript: string | null = null;
          if (run.transcript_path) {
            const fs = await import("node:fs/promises");
            try {
              transcript = await fs.readFile(run.transcript_path, "utf8");
            } catch (err) {
              const code = (err as NodeJS.ErrnoException).code;
              if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
              transcript = null;
            }
          }

          const eventRows = await db.query<EventRow>(
            `SELECT * FROM events
              WHERE subject_kind = 'agent_run' AND subject_id = $1
                AND org_id = $2
              ORDER BY created_at DESC, id DESC`,
            [run.id, orgId],
          );
          const events = eventRows.map((e) => ({
            ...e,
            created_at: isoStamp(e.created_at),
          }));

          return { run, transcript, events };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async ({ params }) => {
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      await cancelRunAction(db, params.runId!, orgId);
    } finally {
      await db.close();
    }
    return actionOk("Run cancelled");
  },
  retry: async ({ params }) => {
    let newId: string;
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      const result = await retryRunAction(db, params.runId!, orgId);
      newId = result.id;
    } finally {
      await db.close();
    }
    throw redirect(303, `/projects/${params.id}/runs/${newId}`);
  },
};
