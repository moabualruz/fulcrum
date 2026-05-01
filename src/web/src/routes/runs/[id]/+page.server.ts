import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { cancelRunAction, retryRunAction, type RunStatus } from "$lib/server/runs";

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

function isoStamp<T extends string | Date | null>(value: T): T extends null ? null : string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (value === null) return null as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (value instanceof Date ? value.toISOString() : value) as any;
}

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const rows = await db.query<AgentRunDetail>(
      `SELECT id, org_id, project_id, agent, model, prompt, status,
              parent_run_id, started_at, ended_at, transcript_path
         FROM agent_runs WHERE id = $1`,
      [params.id],
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
      try {
        const fs = await import("node:fs/promises");
        transcript = await fs.readFile(run.transcript_path, "utf8");
      } catch {
        transcript = null;
      }
    }

    const eventRows = await db.query<EventRow>(
      `SELECT * FROM events
        WHERE subject_kind = 'agent_run' AND subject_id = $1
        ORDER BY created_at DESC, id DESC`,
      [run.id],
    );
    const events = eventRows.map((e) => ({
      ...e,
      created_at: isoStamp(e.created_at),
    }));

    return { run, transcript, events };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  cancel: async ({ params }) => {
    const db = await openProductDb();
    try {
      await cancelRunAction(db, params.id!);
    } finally {
      await db.close();
    }
    return { ok: true };
  },
  retry: async ({ params }) => {
    let newId: string;
    const db = await openProductDb();
    try {
      const result = await retryRunAction(db, params.id!);
      newId = result.id;
    } finally {
      await db.close();
    }
    throw redirect(303, `/runs/${newId}`);
  },
};
