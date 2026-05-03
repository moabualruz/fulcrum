import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { cancelRunAction, retryRunAction, type RunStatus } from "$lib/server/runs";
import { listArtifactsForRun } from "$lib/server/artifacts";
import { actionOk } from "$lib/feedback/action-result";

interface AgentRunDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
  status: RunStatus;
  parent_run_id: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
  transcript_path: string | null;
  attempt_count: number;
  next_retry_at: string | Date | null;
  last_error_kind: string | null;
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
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await db.query<AgentRunDetail>(
            `SELECT id, org_id, project_id, agent, model, prompt, status,
                    parent_run_id, started_at, ended_at, transcript_path,
                    attempt_count, next_retry_at, last_error_kind
               FROM agent_runs WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (rows.length === 0) throw error(404, "Run not found");
          const raw = rows[0]!;
          const run = {
            ...raw,
            started_at: isoStamp(raw.started_at),
            ended_at: isoStamp(raw.ended_at),
            next_retry_at: isoStamp(raw.next_retry_at),
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
          const artifacts = await listArtifactsForRun(db, {
            orgId,
            runId: run.id,
          });

          return { run, transcript, artifacts, events };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async ({ params }) => {
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await cancelRunAction(db, params.id!, orgId);
    } finally {
      await db.close();
    }
    return actionOk("Run cancelled");
  },
  retry: async ({ params }) => {
    let newId: string;
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      const result = await retryRunAction(db, params.id!, orgId);
      newId = result.id;
    } finally {
      await db.close();
    }
    throw redirect(303, `/runs/${newId}`);
  },
};
