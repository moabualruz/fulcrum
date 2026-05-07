import type { EntityManager } from "@mikro-orm/postgresql";
import { readFile } from "node:fs/promises";

import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext, RunDetailDto, RunDto } from "./types.ts";

export async function listRuns(em: EntityManager, ctx: AppContext): Promise<RunDto[]> {
  const runs = await em.find(AgentRun, { org: ctx.orgId } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });
  return runs.map(serializeRun);
}

export async function getRun(em: EntityManager, ctx: AppContext, id: string): Promise<RunDto> {
  const run = await em.findOne(AgentRun, { id } as never);
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return serializeRun(run);
}

export async function getRunDetail(em: EntityManager, ctx: AppContext, id: string): Promise<RunDetailDto> {
  const run = await em.findOne(AgentRun, { id } as never, { populate: ["task"] as never });
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return {
    ...serializeRun(run),
    projectId: run.task?.projectId ?? ctx.projectId ?? null,
    model: run.agentVersion ?? null,
    parentRunId: null,
    startedAt: run.startedAt,
    endedAt: null,
    transcriptPath: run.transcriptPath ?? null,
    workspaceDiffPath: run.workspaceDiffPath ?? null,
  };
}

export function serializeRun(run: AgentRun): RunDto {
  return {
    id: run.id,
    orgId: run.org.id,
    agentName: run.agentName ?? null,
    status: run.status ?? null,
    prompt: run.threadId ?? null,
    createdAt: run.createdAt,
  };
}

export interface ProjectRunRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  symphony_state: string | null;
  started_at: string;
  ended_at: string | null;
  last_error_kind: string | null;
  retry_count: number;
  workspace_path: string | null;
}

export interface AgentRunDetailRow extends ProjectRunRow {
  org_id: string;
  project_id: string | null;
  prompt: string | null;
  parent_run_id: string | null;
  transcript_path: string | null;
}

export interface RunEventRow {
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

export async function listProjectRuns(em: EntityManager, ctx: AppContext): Promise<ProjectRunRow[]> {
  const rows = await ormSqlConnection(em).execute<ProjectRunRow[]>(
    `SELECT ar.id,
            ar.agent_name AS agent,
            ar.agent_version AS model,
            ar.status,
            NULL::text AS symphony_state,
            ar.started_at,
            NULL::timestamptz AS ended_at,
            ar.last_error_kind,
            ar.attempt_count AS retry_count,
            ar.workspace_path
       FROM agent_runs ar
       LEFT JOIN tasks t ON t.id = ar.task_id
      WHERE ar.org_id = $1 AND t.project_id = $2
      ORDER BY started_at DESC`,
    [ctx.orgId, ctx.projectId ?? null],
  );
  return rows.map((row) => ({
    ...row,
    started_at: isoStamp(row.started_at),
    ended_at: nullableIsoStamp(row.ended_at),
  }));
}

export async function getProjectRunPageData(
  em: EntityManager,
  ctx: AppContext,
  runId: string,
): Promise<{
  run: AgentRunDetailRow;
  transcript: string | null;
  artifacts: Array<{
    id: string;
    org_id: string;
    project_id: string | null;
    run_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    body_path: string | null;
    sha256: string | null;
    size: number | null;
    mime: string | null;
    archived: boolean;
    created_at: string;
    downloadHref: string;
  }>;
  events: Array<RunEventRow & { created_at: string }>;
}> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<AgentRunDetailRow[]>(
    `SELECT ar.id,
            ar.org_id,
            t.project_id,
            ar.agent_name AS agent,
            ar.agent_version AS model,
            ar.thread_id AS prompt,
            ar.status,
            NULL::text AS symphony_state,
            NULL::text AS parent_run_id,
            ar.started_at,
            NULL::timestamptz AS ended_at,
            ar.transcript_path,
            ar.last_error_kind,
            ar.attempt_count AS retry_count,
            ar.workspace_path
       FROM agent_runs ar
       LEFT JOIN tasks t ON t.id = ar.task_id
      WHERE ar.id = $1 AND ar.org_id = $2
        AND ($3::text IS NULL OR t.project_id = $3)`,
    [runId, ctx.orgId, ctx.projectId ?? null],
  );
  const raw = rows[0];
  if (!raw) throw new AppNotFoundError("Run not found");
  const run = {
    ...raw,
    started_at: isoStamp(raw.started_at),
    ended_at: nullableIsoStamp(raw.ended_at),
  };

  let transcript: string | null = null;
  if (run.transcript_path) {
    try {
      transcript = await readFile(run.transcript_path, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
    }
  }

  const artifacts = (await conn.execute<Array<{
    id: string;
    org_id: string;
    project_id: string | null;
    run_id: string | null;
    task_id: string | null;
    kind: string;
    title: string;
    body_path: string | null;
    sha256: string | null;
    size: number | null;
    mime: string | null;
    archived: boolean;
    created_at: string | Date;
  }>>(
    `SELECT a.id,
            a.org_id,
            t.project_id,
            a.run_id,
            a.task_id,
            'artifact'::text AS kind,
            a.filename AS title,
            a.path AS body_path,
            a.checksum_sha256 AS sha256,
            a.size_bytes AS size,
            a.mime,
            false AS archived,
            a.created_at
       FROM artifacts a
       LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.run_id = $1 AND a.org_id = $2
      ORDER BY a.created_at DESC, a.id ASC`,
    [run.id, ctx.orgId],
  )).map((artifact) => ({
    ...artifact,
    archived: Boolean(artifact.archived),
    size: artifact.size === null ? null : Number(artifact.size),
    created_at: isoStamp(artifact.created_at),
    downloadHref: `/artifacts/${artifact.id}/download`,
  }));

  const eventRows = await conn.execute<RunEventRow[]>(
    `SELECT * FROM events
      WHERE subject_kind = 'agent_run' AND subject_id = $1
        AND org_id = $2
      ORDER BY created_at DESC, id DESC`,
    [run.id, ctx.orgId],
  );
  const events = eventRows.map((event) => ({
    ...event,
    created_at: isoStamp(event.created_at),
  }));
  return { run, transcript, artifacts, events };
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableIsoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return isoStamp(value);
}
