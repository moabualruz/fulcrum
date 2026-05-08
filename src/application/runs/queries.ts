import type { EntityManager } from "@mikro-orm/postgresql";
import { readFile } from "node:fs/promises";

import { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { previewContext } from "../context/queries.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import { listProjectOptions, type ProjectOption } from "../projects/queries.ts";
import { listOpenTaskOptions, type TaskOption } from "../tasks/queries.ts";
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
  const projectId = run.task?.projectId ?? ctx.projectId ?? null;
  const taskId = run.task?.id ?? null;
  return {
    ...serializeRun(run),
    projectId,
    model: run.agentVersion ?? null,
    parentRunId: null,
    startedAt: run.startedAt,
    endedAt: null,
    transcriptPath: run.transcriptPath ?? null,
    workspaceDiffPath: run.workspaceDiffPath ?? null,
    orchestrationState: run.orchestrationState ?? null,
    workspacePath: run.workspacePath ?? null,
    renderedPrompt: null,
    attemptCount: run.attemptCount,
    nextRetryAt: run.nextRetryAt ?? null,
    lastErrorKind: run.lastErrorKind ?? null,
    observability: await buildRunObservability(em, ctx, {
      runId: run.id,
      status: run.status ?? null,
      projectId,
      taskId,
      attemptCount: run.attemptCount,
      nextRetryAt: run.nextRetryAt ?? null,
      lastErrorKind: run.lastErrorKind ?? null,
    }),
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

async function buildRunObservability(
  em: EntityManager,
  ctx: AppContext,
  input: {
    runId: string;
    status: string | null;
    projectId: string | null;
    taskId: string | null;
    attemptCount: number;
    nextRetryAt: Date | null;
    lastErrorKind: string | null;
  },
): Promise<RunDetailDto["observability"]> {
  const conn = ormSqlConnection(em);
  const context = input.taskId
    ? await previewContext(em, ctx, { projectId: input.projectId, taskId: input.taskId, includeGlobal: false })
    : {
        sourceRefs: [],
        warnings: ["run has no task context"],
        scope: { projectId: input.projectId, taskId: null, includeGlobal: false },
      };
  const artifacts = (await conn.execute<Array<{
    id: string;
    filename: string;
    path: string | null;
    mime: string | null;
    metadata_json: Record<string, unknown> | null;
    created_at: string | Date;
  }>>(
    `SELECT id, filename, path, mime, metadata_json, created_at
       FROM artifacts
      WHERE run_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id ASC`,
    [input.runId, ctx.orgId],
  )).map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    path: artifact.path,
    mime: artifact.mime,
    lifecycleState: typeof artifact.metadata_json?.lifecycleState === "string"
      ? artifact.metadata_json.lifecycleState
      : "created",
    createdAt: isoStamp(artifact.created_at),
  }));
  const audit = (await conn.execute<Array<{
    id: string;
    verb: string;
    actor: string;
    payload: Record<string, unknown> | null;
    created_at: string | Date;
  }>>(
    `SELECT id, verb, actor, payload, created_at
       FROM events
      WHERE subject_kind = 'agent_run' AND subject_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id DESC`,
    [input.runId, ctx.orgId],
  )).map((event) => ({
    id: event.id,
    verb: event.verb,
    actor: event.actor,
    payload: event.payload ?? {},
    createdAt: isoStamp(event.created_at),
  }));

  return {
    context: {
      sourceRefs: context.sourceRefs,
      warnings: context.warnings,
      scope: context.scope,
    },
    artifacts,
    memoryCandidates: [],
    followUpTasks: [],
    audit,
    recovery: {
      retryable: input.status !== "succeeded" && input.status !== "cancelled",
      retryCount: input.attemptCount,
      nextRetryAt: input.nextRetryAt,
      lastErrorKind: input.lastErrorKind,
    },
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

export interface RunRow {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  sandbox_mode: string | null;
  iteration_count: number | null;
}

export interface RunRowsFilter {
  projectId?: string | null;
  agent?: string | null;
  status?: string | null;
  range?: "24h" | "7d" | "30d" | "all";
}

export interface RunsPageData {
  runs: RunRow[];
  projects: ProjectOption[];
  tasks: TaskOption[];
}

export async function loadRunsPageData(
  em: EntityManager,
  ctx: AppContext,
  filter: RunRowsFilter = {},
): Promise<RunsPageData> {
  const runCtx = { ...ctx, projectId: filter.projectId === undefined ? ctx.projectId : filter.projectId };
  const [runs, projects, tasks] = await Promise.all([
    listRunRows(em, runCtx, filter),
    listProjectOptions(em, ctx),
    listOpenTaskOptions(em, ctx),
  ]);
  return { runs, projects, tasks };
}

export async function listRunRows(
  em: EntityManager,
  ctx: AppContext,
  filter: RunRowsFilter = {},
): Promise<RunRow[]> {
  const columns = await agentRunColumns(em);
  const hasProjectId = columns.has("project_id");
  const agentExpr = columns.has("agent") ? "ar.agent" : "ar.agent_name";
  const modelExpr = columns.has("model") ? "ar.model" : "ar.agent_version";
  const statusExpr = columns.has("status") ? "ar.status" : "NULL::text";
  const projectExpr = hasProjectId ? "ar.project_id" : "t.project_id";
  const endedExpr = columns.has("ended_at") ? "ar.ended_at" : "NULL::timestamptz";
  const sandboxExpr = columns.has("sandbox_mode") ? "ar.sandbox_mode" : "NULL::text";
  const iterationExpr = columns.has("iteration_count") ? "ar.iteration_count" : "NULL::int";
  const joins = hasProjectId ? "" : "LEFT JOIN tasks t ON t.id = ar.task_id";
  const conditions = ["ar.org_id = ?"];
  const params: unknown[] = [ctx.orgId];

  if (ctx.projectId !== undefined && ctx.projectId !== null) {
    params.push(ctx.projectId);
    conditions.push(`${projectExpr} = ?`);
  } else if (filter.projectId !== undefined && filter.projectId !== null) {
    params.push(filter.projectId);
    conditions.push(`${projectExpr} = ?`);
  }
  if (filter.projectId === null) {
    conditions.push(`${projectExpr} IS NULL`);
  }
  if (filter.agent) {
    params.push(filter.agent);
    conditions.push(`${agentExpr} = ?`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`${statusExpr} = ?`);
  }
  if (filter.range && filter.range !== "all") {
    const hours = filter.range === "24h" ? 24 : filter.range === "7d" ? 24 * 7 : 24 * 30;
    params.push(new Date(Date.now() - hours * 60 * 60 * 1000));
    conditions.push("ar.started_at >= ?");
  }

  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    agent: string | null;
    model: string | null;
    status: string | null;
    project_id: string | null;
    started_at: string | Date;
    ended_at: string | Date | null;
    sandbox_mode: string | null;
    iteration_count: number | string | null;
  }>>(
    `SELECT ar.id,
            ${agentExpr} AS agent,
            ${modelExpr} AS model,
            ${statusExpr} AS status,
            ${projectExpr} AS project_id,
            ar.started_at,
            ${endedExpr} AS ended_at,
            ${sandboxExpr} AS sandbox_mode,
            ${iterationExpr} AS iteration_count
       FROM agent_runs ar
       ${joins}
      WHERE ${conditions.join(" AND ")}
      ORDER BY ar.started_at DESC, ar.id ASC`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    agent: row.agent ?? "",
    model: row.model ?? null,
    status: row.status ?? "queued",
    project_id: row.project_id ?? null,
    started_at: isoStamp(row.started_at),
    ended_at: nullableIsoStamp(row.ended_at),
    sandbox_mode: row.sandbox_mode ?? null,
    iteration_count: row.iteration_count === null ? null : Number(row.iteration_count),
  }));
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

async function agentRunColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await em.getKysely<any>()
    .selectFrom("information_schema.columns")
    .select(["column_name"])
    .where("table_schema", "=", "public")
    .where("table_name", "=", "agent_runs")
    .execute() as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}
