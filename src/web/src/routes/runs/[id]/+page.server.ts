import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { cancelRunAction, retryRunAction, type RunStatus } from "$lib/server/runs";
import { getWorkspaceDiff, paginateLogs } from "$lib/server/agents";
import { actionOk } from "$lib/feedback/action-result";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";
import { getRun } from "../../../../../../application/runs/queries.ts";
import { listArtifacts } from "../../../../../../application/artifacts/queries.ts";
import { Event } from "../../../../../../db/entities/core/Event.ts";

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
        const em = await getEm();
        const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
        const ctx = { orgId, userId: null, projectId: locals?.activeProjectId ?? null };
        let runDto;
        try {
          runDto = await getRun(em, ctx, params.id);
        } catch {
          throw error(404, "Run not found");
        }
        const run: AgentRunDetail = {
          id: runDto.id,
          org_id: runDto.orgId,
          project_id: ctx.projectId ?? null,
          agent: runDto.agentName ?? "",
          model: null,
          prompt: runDto.prompt,
          status: (runDto.status ?? "queued") as RunStatus,
          parent_run_id: null,
          started_at: runDto.createdAt,
          ended_at: null,
          transcript_path: null,
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

        // Paginated JSONL logs from transcript
        const logs = transcript ? paginateLogs(transcript, 0, 100) : null;

        // Workspace diff
        const diff = await getWorkspaceDiff();

        // Artifacts
        const artifacts = (await listArtifacts(em, ctx))
          .filter((artifact) => artifact.id === params.id || true)
          .map((artifact) => ({
            id: artifact.id,
            org_id: artifact.orgId,
            project_id: ctx.projectId ?? null,
            run_id: params.id,
            task_id: null,
            kind: "artifact",
            title: artifact.filename,
            body_path: artifact.path,
            sha256: null,
            size: null,
            mime: artifact.mime,
            archived: false,
            created_at: isoStamp(artifact.createdAt),
            downloadHref: `/artifacts/${artifact.id}/download`,
          }));

        const eventRows = await em.find(Event, {
          org: orgId,
          subjectKind: "agent_run",
          subjectId: run.id,
        } as never, { orderBy: { createdAt: "DESC", id: "DESC" } });
        const events: EventRow[] = eventRows.map((e) => ({
          id: e.id,
          org_id: orgId,
          project_id: e.projectId ?? null,
          subject_kind: e.subjectKind,
          subject_id: e.subjectId ?? "",
          verb: e.verb,
          payload: e.payload ?? {},
          actor: e.actor ?? "system",
          created_at: isoStamp(e.createdAt),
        }));

        return { run: { ...run, started_at: isoStamp(run.started_at), ended_at: isoStamp(run.ended_at) }, transcript, logs, diff, artifacts, events };
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async ({ params }) => {
    const em = await getEm();
    const orgId = await getDefaultOrgIdOrm(em);
    await cancelRunAction(em, params.id!, orgId);
    return actionOk("Run cancelled");
  },
  retry: async ({ params }) => {
    const em = await getEm();
    const orgId = await getDefaultOrgIdOrm(em);
    const result = await retryRunAction(em, params.id!, orgId);
    const newId = result.id;
    throw redirect(303, `/runs/${newId}`);
  },
};
