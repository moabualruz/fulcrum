import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { paginateLogs } from "$lib/server/agents";
import { actionOk } from "$lib/feedback/action-result";
import { createAgentRunApiForEvent } from "$lib/server/agent-run-api";
import type { RunStatus } from "$lib/server/runs";

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

interface RunObservabilityPayload {
  context: {
    sourceRefs: Array<{ kind: string; id: string; reason: string; scope: string }>;
    warnings: string[];
    scope: { projectId: string | null; taskId: string | null; includeGlobal: boolean };
  };
  artifacts: Array<{
    id: string;
    filename: string;
    path: string | null;
    mime: string | null;
    lifecycleState: string;
    createdAt: string;
  }>;
  memoryCandidates: Array<Record<string, unknown>>;
  followUpTasks: Array<Record<string, unknown>>;
  audit: Array<{ id: string; verb: string; actor: string; payload: Record<string, unknown>; createdAt: string }>;
  recovery: {
    retryable: boolean;
    retryCount: number;
    nextRetryAt: string | Date | null;
    lastErrorKind: string | null;
  };
}

function isoStamp(value: string | Date): string;
function isoStamp(value: string | Date | null): string | null;
function isoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  let preloadedData;
  try {
    preloadedData = await createAgentRunApiForEvent(event).runs.pageDetail({
      id: params.id,
      projectId: locals?.activeProjectId ?? null,
    });
  } catch {
    throw error(404, "Run not found");
  }
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    streamed: {
      data: (async () => {
        const data = preloadedData;

        const run = { ...data.run, status: data.run.status as RunStatus };
        const transcript = data.transcript;
        const logs = transcript ? paginateLogs(transcript, 0, 100) : null;
        const diff = data.diff;
        const observability: RunObservabilityPayload = {
          context: {
            sourceRefs: [],
            warnings: [],
            scope: { projectId: run.project_id, taskId: null, includeGlobal: false },
          },
          artifacts: data.artifacts.map((artifact) => ({
            id: artifact.id,
            filename: artifact.title,
            path: artifact.body_path,
            mime: artifact.mime,
            lifecycleState: artifact.lifecycle_state,
            createdAt: artifact.created_at,
          })),
          memoryCandidates: [],
          followUpTasks: [],
          audit: data.events.map((event) => ({
            id: event.id,
            verb: event.verb,
            actor: event.actor,
            payload: event.payload,
            createdAt: event.created_at,
          })),
          recovery: {
            retryable: run.status !== "succeeded" && run.status !== "cancelled",
            retryCount: Number(data.run.retry_count ?? 0),
            nextRetryAt: null,
            lastErrorKind: data.run.last_error_kind,
          },
        };
        return { run, transcript, logs, diff, artifacts: data.artifacts, events: data.events, observability };
      })(),
    },
  };
};

export const actions: Actions = {
  cancel: async (event) => {
    await createAgentRunApiForEvent(event).runs.cancel({ id: event.params.id! });
    return actionOk("Run cancelled");
  },
  retry: async (event) => {
    const result = await createAgentRunApiForEvent(event).runs.retry({ id: event.params.id! }) as { id: string };
    const newId = result.id;
    throw redirect(303, `/runs/${newId}`);
  },
  archiveArtifact: async (event) => {
    const { params, locals, request } = event;
    const form = await request.formData();
    await createAgentRunApiForEvent(event).runs.archiveArtifact({
      id: params.id!,
      artifactId: requiredField(form, "artifactId"),
      projectId: locals?.activeProjectId ?? null,
    });
    return actionOk("Artifact archived");
  },
  linkArtifactToDoc: async (event) => {
    const { params, locals, request } = event;
    const form = await request.formData();
    await createAgentRunApiForEvent(event).runs.linkArtifactToDoc({
      id: params.id!,
      artifactId: requiredField(form, "artifactId"),
      docId: requiredField(form, "docId"),
      projectId: locals?.activeProjectId ?? null,
    });
    return actionOk("Artifact linked to doc");
  },
  promoteArtifactToMemory: async (event) => {
    const { params, locals, request } = event;
    const form = await request.formData();
    await createAgentRunApiForEvent(event).runs.promoteArtifactToMemory({
      id: params.id!,
      artifactId: requiredField(form, "artifactId"),
      projectId: locals?.activeProjectId ?? null,
    });
    return actionOk("Artifact promoted to memory");
  },
};

function requiredField(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) throw error(400, `${name} is required`);
  return value.trim();
}
