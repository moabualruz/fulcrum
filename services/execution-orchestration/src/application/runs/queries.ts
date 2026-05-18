import type { EntityManager } from "typeorm";
import { readFile } from "node:fs/promises";

import { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import { previewContext } from "@knowledge-workspace/application/context/queries.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { listProjectOptions, type ProjectOption } from "@work-management/application/projects/queries.ts";
import { listOpenTaskOptions, type TaskOption } from "@work-management/application/tasks/queries.ts";
import type { AppContext, RunDetailDto, RunDto } from "@execution-orchestration/application/runs/types.ts";

export async function listRuns(em: EntityManager, ctx: AppContext): Promise<RunDto[]> {
  const runs = await em.find(AgentRun, { where: { org: { id: ctx.orgId } } as never, order: { createdAt: "DESC", id: "ASC" } });
  return runs.map(serializeRun);
}

export async function getRun(em: EntityManager, ctx: AppContext, id: string): Promise<RunDto> {
  const run = await em.findOne(AgentRun, { where: { id } as never });
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  return serializeRun(run);
}

export async function getRunDetail(em: EntityManager, ctx: AppContext, id: string): Promise<RunDetailDto> {
  const run = await em.findOne(AgentRun, { where: { id } as never, relations: { task: true } as never });
  if (!run) throw new AppNotFoundError(`Run not found: ${id}`);
  if (run.org.id !== ctx.orgId) throw new AppForbiddenError(`Run does not belong to org: ${ctx.orgId}`);
  const projectId = run.task?.projectId ?? ctx.projectId ?? null;
  const taskId = run.task?.id ?? null;
  return {
    ...serializeRun(run),
    projectId,
    state: run.orchestrationState ?? null,
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
    projectId: run.task?.projectId ?? null,
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
    ? await optionalContext(em, ctx, { projectId: input.projectId, taskId: input.taskId, includeGlobal: false })
    : {
        sourceRefs: [],
        warnings: ["run has no task context"],
        scope: { projectId: input.projectId, taskId: null, includeGlobal: false },
      };
  const artifacts = (await optionalRows(conn, `SELECT id, filename, path, mime, metadata_json, created_at
       FROM artifacts
      WHERE run_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id ASC`, [input.runId, ctx.orgId]) as Array<{
    id: string;
    filename: string;
    path: string | null;
    mime: string | null;
    metadata_json: Record<string, unknown> | null;
    created_at: string | Date;
  }>).map((artifact) => ({
    id: artifact.id,
    filename: artifact.filename,
    path: artifact.path,
    mime: artifact.mime,
    lifecycleState: typeof artifact.metadata_json?.lifecycleState === "string"
      ? artifact.metadata_json.lifecycleState
      : "created",
    createdAt: isoStamp(artifact.created_at),
  }));
  const audit = (await optionalRows(conn, `SELECT id, verb, actor, payload, created_at
       FROM events
      WHERE subject_kind = 'agent_run' AND subject_id = $1 AND org_id = $2
      ORDER BY created_at DESC, id DESC`, [input.runId, ctx.orgId]) as Array<{
    id: string;
    verb: string;
    actor: string;
    payload: Record<string, unknown> | null;
    created_at: string | Date;
  }>).map((event) => ({
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

async function optionalContext(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string | null; taskId: string; includeGlobal: boolean },
): ReturnType<typeof previewContext> {
  try {
    return await previewContext(em, ctx, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/relation .* does not exist|table .* does not exist|column .* does not exist/i.test(message)) throw error;
    return {
      bundle: {
        memories: [],
        documents: [],
        recentRuns: [],
        artifacts: [],
        tokenBudget: { used: 0, total: 0 },
      },
      sourceRefs: [],
      warnings: ["context preview unavailable for this schema"],
      scope: { projectId: input.projectId, taskId: input.taskId, includeGlobal: input.includeGlobal },
    };
  }
}

async function optionalRows<T>(
  conn: ReturnType<typeof ormSqlConnection>,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  try {
    return await conn.execute<T[]>(sql, params as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .* does not exist|table .* does not exist|column .* does not exist/i.test(message)) return [];
    throw error;
  }
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
  workspace_diff_path: string | null;
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

export interface ApprovalQueueItem {
  id: string;
  toolName: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  argumentsSummary: string;
  context: string;
  timeoutAt: string | null;
  requestedAt: string;
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
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const conditions = [`ar.org_id = ${bind(ctx.orgId)}`];

  if (ctx.projectId !== undefined && ctx.projectId !== null) {
    conditions.push(`${projectExpr} = ${bind(ctx.projectId)}`);
  } else if (filter.projectId !== undefined && filter.projectId !== null) {
    conditions.push(`${projectExpr} = ${bind(filter.projectId)}`);
  }
  if (filter.projectId === null) {
    conditions.push(`${projectExpr} IS NULL`);
  }
  if (filter.agent) {
    conditions.push(`${agentExpr} = ${bind(filter.agent)}`);
  }
  if (filter.status) {
    conditions.push(`${statusExpr} = ${bind(filter.status)}`);
  }
  if (filter.range && filter.range !== "all") {
    const hours = filter.range === "24h" ? 24 : filter.range === "7d" ? 24 * 7 : 24 * 30;
    conditions.push(`ar.started_at >= ${bind(new Date(Date.now() - hours * 60 * 60 * 1000))}`);
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
  const columns = await agentRunColumns(em);
  const hasProjectId = columns.has("project_id");
  const hasTaskId = columns.has("task_id");
  const agentExpr = columns.has("agent") ? "ar.agent" : "ar.agent_name";
  const modelExpr = columns.has("model") ? "ar.model" : "ar.agent_version";
  const stateExpr = columns.has("symphony_state")
    ? "ar.symphony_state"
    : columns.has("orchestration_state")
      ? "ar.orchestration_state"
      : "NULL::text";
  const endedExpr = columns.has("ended_at") ? "ar.ended_at" : "NULL::timestamptz";
  const errorExpr = columns.has("last_error_kind") ? "ar.last_error_kind" : "NULL::text";
  const retryExpr = columns.has("retry_count") ? "ar.retry_count" : columns.has("attempt_count") ? "ar.attempt_count" : "0";
  const workspaceExpr = columns.has("workspace_path") ? "ar.workspace_path" : "NULL::text";
  const projectExpr = hasProjectId ? "ar.project_id" : hasTaskId ? "t.project_id" : "NULL::text";
  const joins = hasProjectId || !hasTaskId ? "" : "LEFT JOIN tasks t ON t.id = ar.task_id";
  const rows = await ormSqlConnection(em).execute<ProjectRunRow[]>(
    `SELECT ar.id,
            ${agentExpr} AS agent,
            ${modelExpr} AS model,
            ar.status,
            ${stateExpr} AS symphony_state,
            ar.started_at,
            ${endedExpr} AS ended_at,
            ${errorExpr} AS last_error_kind,
            ${retryExpr} AS retry_count,
            ${workspaceExpr} AS workspace_path
       FROM agent_runs ar
       ${joins}
      WHERE ar.org_id = $1 AND ${projectExpr} = $2
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
  diff: string | null;
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
  approvalQueue: ApprovalQueueItem[];
}> {
  const conn = ormSqlConnection(em);
  const columns = await agentRunColumns(em);
  const artifactCols = await artifactColumns(em);
  const hasProjectId = columns.has("project_id");
  const hasTaskId = columns.has("task_id");
  const agentExpr = columns.has("agent") ? "ar.agent" : "ar.agent_name";
  const modelExpr = columns.has("model") ? "ar.model" : "ar.agent_version";
  const promptExpr = columns.has("prompt") ? "ar.prompt" : columns.has("thread_id") ? "ar.thread_id" : "NULL::text";
  const stateExpr = columns.has("symphony_state")
    ? "ar.symphony_state"
    : columns.has("orchestration_state")
      ? "ar.orchestration_state"
      : "NULL::text";
  const parentExpr = columns.has("parent_run_id") ? "ar.parent_run_id" : "NULL::text";
  const endedExpr = columns.has("ended_at") ? "ar.ended_at" : "NULL::timestamptz";
  const transcriptExpr = columns.has("transcript_path") ? "ar.transcript_path" : "NULL::text";
  const diffExpr = columns.has("workspace_diff_path") ? "ar.workspace_diff_path" : "NULL::text";
  const errorExpr = columns.has("last_error_kind") ? "ar.last_error_kind" : "NULL::text";
  const retryExpr = columns.has("retry_count") ? "ar.retry_count" : columns.has("attempt_count") ? "ar.attempt_count" : "0";
  const workspaceExpr = columns.has("workspace_path") ? "ar.workspace_path" : "NULL::text";
  const projectExpr = hasProjectId ? "ar.project_id" : hasTaskId ? "t.project_id" : "NULL::text";
  const runJoins = hasProjectId || !hasTaskId ? "" : "LEFT JOIN tasks t ON t.id = ar.task_id";
  const rows = await conn.execute<AgentRunDetailRow[]>(
    `SELECT ar.id,
            ar.org_id,
            ${projectExpr} AS project_id,
            ${agentExpr} AS agent,
            ${modelExpr} AS model,
            ${promptExpr} AS prompt,
            ar.status,
            ${stateExpr} AS symphony_state,
            ${parentExpr} AS parent_run_id,
            ar.started_at,
            ${endedExpr} AS ended_at,
            ${transcriptExpr} AS transcript_path,
            ${diffExpr} AS workspace_diff_path,
            ${errorExpr} AS last_error_kind,
            ${retryExpr} AS retry_count,
            ${workspaceExpr} AS workspace_path
       FROM agent_runs ar
       ${runJoins}
      WHERE ar.id = $1 AND ar.org_id = $2
        AND ($3::text IS NULL OR ${projectExpr} = $3)`,
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

  let diff: string | null = null;
  if (run.workspace_diff_path) {
    try {
      diff = await readFile(run.workspace_diff_path, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
    }
  }

  const artifactProjectExpr = artifactCols.has("project_id") ? "a.project_id" : artifactCols.has("task_id") ? "at.project_id" : "NULL::text";
  const artifactTaskExpr = artifactCols.has("task_id") ? "a.task_id" : "NULL::text";
  const artifactKindExpr = artifactCols.has("kind") ? "a.kind" : "'artifact'::text";
  const artifactTitleExpr = artifactCols.has("title") ? "a.title" : artifactCols.has("filename") ? "a.filename" : "a.path";
  const artifactBodyExpr = artifactCols.has("body_path") ? "a.body_path" : artifactCols.has("path") ? "a.path" : "NULL::text";
  const artifactShaExpr = artifactCols.has("sha256") ? "a.sha256" : artifactCols.has("checksum_sha256") ? "a.checksum_sha256" : "NULL::text";
  const artifactSizeExpr = artifactCols.has("size") ? "a.size" : artifactCols.has("size_bytes") ? "a.size_bytes" : "NULL::bigint";
  const artifactArchivedExpr = artifactCols.has("archived") ? "a.archived" : "false";
  const artifactCreatedExpr = artifactCols.has("created_at") ? "a.created_at" : "now()";
  const artifactJoins = artifactCols.has("project_id") || !artifactCols.has("task_id") ? "" : "LEFT JOIN tasks at ON at.id = a.task_id";
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
            ${artifactProjectExpr} AS project_id,
            a.run_id,
            ${artifactTaskExpr} AS task_id,
            ${artifactKindExpr} AS kind,
            ${artifactTitleExpr} AS title,
            ${artifactBodyExpr} AS body_path,
            ${artifactShaExpr} AS sha256,
            ${artifactSizeExpr} AS size,
            a.mime,
            ${artifactArchivedExpr} AS archived,
            ${artifactCreatedExpr} AS created_at
       FROM artifacts a
       ${artifactJoins}
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
  return { run, transcript, diff, artifacts, events, approvalQueue: buildApprovalQueue(events) };
}

function buildApprovalQueue(events: Array<RunEventRow & { created_at: string }>): ApprovalQueueItem[] {
  const decisions = new Set(
    events
      .filter((event) => event.verb === "approval.decision")
      .map((event) => stringValue(event.payload, "approvalId"))
      .filter((value): value is string => value !== null),
  );
  return events
    .filter((event) => event.verb === "approval.requested" || event.verb === "approval.required")
    .map((event) => {
      const approvalId = stringValue(event.payload, "approvalId") ?? event.id;
      return {
        id: approvalId,
        toolName: stringValue(event.payload, "toolName") ?? stringValue(event.payload, "tool") ?? "Tool call",
        riskLevel: riskLevelValue(event.payload["riskLevel"] ?? event.payload["risk_level"]),
        argumentsSummary: jsonSummary(event.payload["arguments"] ?? event.payload["args"] ?? event.payload["input"]),
        context: stringValue(event.payload, "context") ?? stringValue(event.payload, "summary") ?? "No context supplied.",
        timeoutAt: stringValue(event.payload, "timeoutAt") ?? stringValue(event.payload, "timeout_at"),
        requestedAt: event.created_at,
      } satisfies ApprovalQueueItem;
    })
    .filter((item) => !decisions.has(item.id));
}

function stringValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function jsonSummary(value: unknown): string {
  if (value === null || value === undefined) return "{}";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function riskLevelValue(value: unknown): ApprovalQueueItem["riskLevel"] {
  return value === "low" || value === "medium" || value === "high" || value === "critical" ? value : "medium";
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableIsoStamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return isoStamp(value);
}

async function agentRunColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'agent_runs'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

async function artifactColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'artifacts'`,
  );
  return new Set(rows.map((row) => row.column_name));
}
