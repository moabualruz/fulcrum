import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveAgentRunConfig } from "@execution-orchestration/application/agent-catalog/resolve-agent-run-config.ts";
import { runAgent } from "@execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts";
import type { AgentRunRequest, AgentRunResult } from "@execution-orchestration/infrastructure/agent-runtime/types.ts";
import { getEventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm, ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export interface DependencyRunLiveFeedbackInput {
  projectId?: string | null;
  traceId?: string | null;
  runGroupId?: string | null;
  runId?: string | null;
  taskId?: string | null;
}

export interface DependencyRunLifecycleEventInput {
  projectId?: string | null;
  traceId?: string | null;
  runId: string;
  taskId?: string | null;
  status: string;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId?: string | null;
  taskLineageId?: string | null;
  summary?: string | null;
  output?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface DependencyRunLiveRun {
  id: string;
  taskId: string | null;
  traceId: string;
  status: string;
  queuePosition: number;
  dependencyIds: string[];
  latestEventSummary: string | null;
  lastActivityAt: string | null;
}

export interface DependencyRunLiveEvent {
  id: string;
  runId: string;
  taskId: string | null;
  traceId: string;
  sequence: number;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId: string | null;
  taskLineageId: string | null;
  summary: string;
  output: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DependencyRunExecutorStatus {
  queuedTaskCount: number;
  runningTaskCount: number;
  succeededTaskCount: number;
  failedTaskCount: number;
  blockedTaskCount: number;
  inReviewCount: number;
  active: boolean;
  lastActivityAt: string | null;
}

export interface DependencyRunLiveFeedbackOutput {
  projectId: string;
  traceId: string;
  runGroupId: string;
  fetchedAt: string;
  executorStatus: DependencyRunExecutorStatus;
  runs: DependencyRunLiveRun[];
  events: DependencyRunLiveEvent[];
  latestEvent: DependencyRunLiveEvent | null;
}

export interface DependencyRunLifecycleEventOutput {
  run: {
    id: string;
    taskId: string | null;
    traceId: string;
    status: string;
  };
  event: DependencyRunLiveEvent;
}

export interface DependencyRunWorkerTickInput {
  projectId?: string | null;
  traceId?: string | null;
  runGroupId?: string | null;
  workerId?: string | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export interface DependencyRunWorkerRunContext extends AgentRunRequest {
  projectId: string;
  taskId: string | null;
  traceId: string;
  agent: string;
  model: string | null;
  dependencyIds: string[];
  queuePosition: number;
}

export interface DependencyRunWorkerTickOutput {
  projectId: string;
  traceId: string;
  runGroupId: string;
  workerId: string;
  processedRun: {
    id: string;
    taskId: string | null;
    traceId: string;
    agent: string;
    status: "succeeded" | "failed" | "queued";
    output: string;
    jobId: string;
  } | null;
  skippedReason: string | null;
  feedback: DependencyRunLiveFeedbackOutput;
}

export interface DependencyRunWorkerTickDeps {
  runAgent?: (request: DependencyRunWorkerRunContext) => Promise<AgentRunResult>;
}

export function dependencyRunLiveFeedbackTopic(input: {
  orgId: string;
  projectId: string;
  traceId: string;
}): string {
  return `tasks.dependency-run-feedback.${input.orgId}.${input.projectId}.${input.traceId}`;
}

export async function publishDependencyRunLiveFeedbackForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DependencyRunLiveFeedbackInput,): Promise<DependencyRunLiveFeedbackOutput> {
  const feedback = await loadDependencyRunLiveFeedbackForTasks(em, ctx, input);
  getEventBus().publish<DependencyRunLiveFeedbackOutput>(
    dependencyRunLiveFeedbackTopic({
      orgId: ctx.orgId,
      projectId: feedback.projectId,
      traceId: feedback.traceId,
    }),
    feedback,);
  return feedback;
}

interface DispatchEventRow {
  id: string;
  subject_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string | Date;
}

interface AgentRunRow {
  id: string;
  task_id: string | null;
  status: string | null;
  thread_id: string | null;
  started_at: string | Date;
  created_at: string | Date;
  dependencies: Record<string, unknown> | null;
}

interface WorkerRunRow {
  id: string;
  task_id: string | null;
  agent_name: string | null;
  agent_version: string | null;
  thread_id: string | null;
  status: string | null;
  dependencies: Record<string, unknown> | null;
}

interface LifecycleEventRow {
  id: string;
  run_id: string;
  payload: Record<string, unknown> | null;
  actor: string | null;
  created_at: string | Date;
  verb: string;
}

interface ClaimedJobRow {
  id: string;
  attempts: number;
  max_attempts: number;
}

interface JobColumnRow {
  column_name: string;
}

export async function recordDependencyRunLifecycleEventForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DependencyRunLifecycleEventInput,): Promise<DependencyRunLifecycleEventOutput> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  if (!projectId) throw new AppValidationError("Dependency run projectId is required.");
  if (!input.runId.trim()) throw new AppValidationError("Dependency run runId is required.");
  if (!input.status.trim()) throw new AppValidationError("Dependency run status is required.");
  if (!input.domain.trim()) throw new AppValidationError("Dependency run event domain is required.");
  if (!input.mutationType.trim()) throw new AppValidationError("Dependency run event mutationType is required.");
  if (!input.targetKind.trim()) throw new AppValidationError("Dependency run event targetKind is required.");
  if (!input.targetId.trim()) throw new AppValidationError("Dependency run event targetId is required.");

  const conn = ormSqlConnection(em);
  const runRows = await conn.execute<Array<{
    id: string;
    task_id: string | null;
    thread_id: string | null;
  }>>(
    `select id, task_id, thread_id
       from agent_runs
      where id = $1 and org_id = $2`,
    [input.runId, ctx.orgId],);
  const run = runRows[0];
  if (!run) throw new AppValidationError(`Dependency run not found: ${input.runId}`);

  const traceId = input.traceId?.trim() || extractTraceId(run.thread_id) || input.taskLineageId?.trim();
  if (!traceId) throw new AppValidationError("Dependency run traceId is required.");
  const taskId = input.taskId === undefined ? run.task_id : input.taskId;

  await conn.execute(
    `update agent_runs
        set status = $1,
            last_codex_timestamp = now()
      where id = $2 and org_id = $3`,
    [input.status, input.runId, ctx.orgId],);
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId,
    actor: input.agentId?.trim() || "system",
    subjectKind: "agent_run",
    subjectId: input.runId,
    verb: input.mutationType,
    payload: {...(input.payload ?? {}),
      traceId,
      runGroupId: traceId,
      runId: input.runId,
      taskId: taskId ?? null,
      status: input.status,
      domain: input.domain,
      mutationType: input.mutationType,
      targetKind: input.targetKind,
      targetId: input.targetId,
      agentId: input.agentId?.trim() || null,
      taskLineageId: input.taskLineageId?.trim() || traceId,...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),...(input.output?.trim() ? { output: input.output.trim() } : {}),
    },
  });

  const eventRows = await conn.execute<LifecycleEventRow[]>(
    `select id, subject_id as run_id, verb, payload, actor, created_at
       from events
      where id = $1 and org_id = $2`,
    [event.id, ctx.orgId],);
  const liveEvent = toLiveEvent(eventRows[0]!, {
    fallbackTraceId: traceId,
    fallbackTaskId: taskId ?? null,
    sequence: 1,
  });
  await publishDependencyRunLiveFeedbackForTasks(em, {...ctx, projectId }, {
    projectId,
    traceId,
    runId: input.runId,
    taskId: taskId ?? null,
  });
  return {
    run: {
      id: input.runId,
      taskId: taskId ?? null,
      traceId,
      status: input.status,
    },
    event: liveEvent,
  };
}

export async function loadDependencyRunLiveFeedbackForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DependencyRunLiveFeedbackInput,): Promise<DependencyRunLiveFeedbackOutput> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  if (!projectId) throw new AppValidationError("Dependency run projectId is required.");
  const traceId = input.traceId?.trim() || input.runGroupId?.trim();
  if (!traceId && !input.runId?.trim()) {
    throw new AppValidationError("Dependency run traceId or runId is required.");
  }
  const conn = ormSqlConnection(em);
  const dispatchEvents = await conn.execute<DispatchEventRow[]>(
    `select id, subject_id, payload, created_at
       from events
      where org_id = $1
        and project_id = $2
        and verb = 'dependency_tree_dispatched'
      order by created_at asc, id asc`,
    [ctx.orgId, projectId],);
  const matchingDispatch = dispatchEvents.filter((event) => event.payload?.traceId === traceId).at(-1) ?? null;
  const scopedTraceId = traceId || extractTraceIdFromPayload(matchingDispatch?.payload) || "";
  if (!scopedTraceId) throw new AppValidationError("Dependency run traceId is required.");
  const scheduledRunIds = normalizeStringArray(matchingDispatch?.payload?.scheduledRunIds);
  const runRows = await loadRunRows(conn, ctx.orgId, {
    runIds: input.runId ? [input.runId] : scheduledRunIds,
    traceId: scopedTraceId,
    taskId: input.taskId ?? null,
    includeTraceMatches: !input.runId,
  });
  const runIds = runRows.map((run) => run.id);
  const lifecycleRows = runIds.length
    ? await loadLifecycleEventRows(conn, ctx.orgId, projectId, runIds, scopedTraceId)
    : [];
  const dispatchRunId = scheduledRunIds[0] ?? runIds[0] ?? input.runId ?? "";
  const dispatchTaskId = typeof matchingDispatch?.subject_id === "string" ? matchingDispatch.subject_id : null;
  const liveEvents = [...(matchingDispatch && dispatchRunId
      ? [dispatchToLiveEvent(matchingDispatch, {
        runId: dispatchRunId,
        traceId: scopedTraceId,
        taskId: dispatchTaskId,
        sequence: 1,
      })]
      : []),...lifecycleRows.map((row, index) => toLiveEvent(row, {
      fallbackTraceId: scopedTraceId,
      fallbackTaskId: null,
      sequence: index + (matchingDispatch ? 2 : 1),
    })),
  ];
  const latestByRunId = new Map<string, DependencyRunLiveEvent>;
  for (const event of liveEvents) latestByRunId.set(event.runId, event);
  const order = new Map(scheduledRunIds.map((id, index) => [id, index]));
  const liveRuns = [...runRows].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)).map((run, index): DependencyRunLiveRun => {
      const latestEvent = latestByRunId.get(run.id) ?? null;
      return {
        id: run.id,
        taskId: run.task_id,
        traceId: scopedTraceId,
        status: run.status ?? "queued",
        queuePosition: index + 1,
        dependencyIds: normalizeTaskDependencyIds(run.dependencies),
        latestEventSummary: latestEvent?.summary ?? null,
        lastActivityAt: latestEvent?.createdAt ?? isoStamp(run.started_at),
      };
    });
  const latestEvent = liveEvents.at(-1) ?? null;

  return {
    projectId,
    traceId: scopedTraceId,
    runGroupId: scopedTraceId,
    fetchedAt: new Date().toISOString(),
    executorStatus: buildExecutorStatus(liveRuns, latestEvent),
    runs: liveRuns,
    events: liveEvents,
    latestEvent,
  };
}

export async function runNextDependencyRunWorkerTickForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DependencyRunWorkerTickInput,
  deps: DependencyRunWorkerTickDeps = {},): Promise<DependencyRunWorkerTickOutput> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  if (!projectId) throw new AppValidationError("Dependency run projectId is required.");
  const traceId = input.traceId?.trim() || input.runGroupId?.trim();
  if (!traceId) throw new AppValidationError("Dependency run traceId is required.");
  const workerId = input.workerId?.trim() || "dependency-run-worker";
  const conn = ormSqlConnection(em);

  const before = await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
    projectId,
    traceId,
  });
  const candidate = firstEligibleQueuedRun(before.runs);
  if (!candidate) {
    return {
      projectId,
      traceId,
      runGroupId: traceId,
      workerId,
      processedRun: null,
      skippedReason: "no eligible queued dependency run",
      feedback: before,
    };
  }

  const job = await claimAgentRunJob(conn, {
    orgId: ctx.orgId,
    projectId,
    runId: candidate.id,
    workerId,
  });
  if (!job) {
    return {
      projectId,
      traceId,
      runGroupId: traceId,
      workerId,
      processedRun: null,
      skippedReason: "no queued job for eligible dependency run",
      feedback: before,
    };
  }

  const run = await loadWorkerRun(conn, ctx.orgId, candidate.id);
  if (!run) {
    await failAgentRunJob(conn, job, "agent run row missing");
    throw new AppValidationError(`Dependency run not found: ${candidate.id}`);
  }

  await conn.execute(
    `update tasks set status = 'in_progress', updated_at = now()
      where id = ? and org_id = ?`,
    [run.task_id, ctx.orgId],);
  await recordDependencyRunLifecycleEventForTasks(em, ctx, {
    projectId,
    traceId,
    runId: run.id,
    taskId: run.task_id,
    status: "running",
    domain: "executor",
    mutationType: "agent_run_started",
    targetKind: run.task_id ? "task" : "agent_run",
    targetId: run.task_id ?? run.id,
    agentId: run.agent_name ?? "agent",
    taskLineageId: traceId,
    summary: `Started ${run.task_id ?? run.id}`,
    output: `worker=${workerId}`,
    payload: { jobId: job.id, queuePosition: candidate.queuePosition },
  });

  try {
    const request = buildWorkerRunRequest({
      input,
      projectId,
      traceId,
      run,
      liveRun: candidate,
    });
    const result = await (deps.runAgent ?? defaultRunAgent)(request);
    const succeeded = result.exitCode === 0 && result.exitReason === "complete";
    const output = result.transcript.trim() || result.exitReason;
    if (succeeded) {
      await completeAgentRunJob(conn, job.id);
      await persistWorkerResult(conn, ctx.orgId, run.id, result);
      await conn.execute(
        `update tasks set status = 'in_review', updated_at = now()
          where id = ? and org_id = ?`,
        [run.task_id, ctx.orgId],);
      await recordDependencyRunLifecycleEventForTasks(em, ctx, {
        projectId,
        traceId,
        runId: run.id,
        taskId: run.task_id,
        status: "succeeded",
        domain: "executor",
        mutationType: "agent_run_completed",
        targetKind: run.task_id ? "task" : "agent_run",
        targetId: run.task_id ?? run.id,
        agentId: run.agent_name ?? "agent",
        taskLineageId: traceId,
        summary: "Agent run completed",
        output,
        payload: {
          jobId: job.id,
          exitCode: result.exitCode,
          exitReason: result.exitReason,
          durationMs: result.durationMs,
          iterationCount: result.iterationCount,
          tokenUsed: result.tokenUsed ?? null,
          transcriptPath: result.transcriptPath ?? null,
          workspaceDiffPath: result.workspaceDiffPath ?? null,
        },
      });
      return workerTickOutput(em, ctx, {
        projectId,
        traceId,
        workerId,
        run,
        jobId: job.id,
        status: "succeeded",
        output,
      });
    }

    const retry = await failAgentRunJob(conn, job, output);
    const nextStatus = retry === "queued" ? "queued" : "failed";
    await recordDependencyRunLifecycleEventForTasks(em, ctx, {
      projectId,
      traceId,
      runId: run.id,
      taskId: run.task_id,
      status: nextStatus,
      domain: "executor",
      mutationType: retry === "queued" ? "agent_run_retry_queued" : "agent_run_failed",
      targetKind: run.task_id ? "task" : "agent_run",
      targetId: run.task_id ?? run.id,
      agentId: run.agent_name ?? "agent",
      taskLineageId: traceId,
      summary: retry === "queued" ? "Agent run queued for retry" : "Agent run failed",
      output,
      payload: { jobId: job.id, exitCode: result.exitCode, exitReason: result.exitReason },
    });
    return workerTickOutput(em, ctx, {
      projectId,
      traceId,
      workerId,
      run,
      jobId: job.id,
      status: nextStatus,
      output,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = await failAgentRunJob(conn, job, message);
    const nextStatus = retry === "queued" ? "queued" : "failed";
    await recordDependencyRunLifecycleEventForTasks(em, ctx, {
      projectId,
      traceId,
      runId: run.id,
      taskId: run.task_id,
      status: nextStatus,
      domain: "executor",
      mutationType: retry === "queued" ? "agent_run_retry_queued" : "agent_run_failed",
      targetKind: run.task_id ? "task" : "agent_run",
      targetId: run.task_id ?? run.id,
      agentId: run.agent_name ?? "agent",
      taskLineageId: traceId,
      summary: retry === "queued" ? "Agent run queued for retry" : "Agent run failed",
      output: message,
      payload: { jobId: job.id },
    });
    return workerTickOutput(em, ctx, {
      projectId,
      traceId,
      workerId,
      run,
      jobId: job.id,
      status: nextStatus,
      output: message,
    });
  }
}

async function loadRunRows(
  conn: ReturnType<typeof ormSqlConnection>,
  orgId: string,
  input: { runIds: string[]; traceId: string; taskId: string | null; includeTraceMatches: boolean },): Promise<AgentRunRow[]> {
  const params: unknown[] = [orgId];
  const clauses = ["ar.org_id = ?"];
  if (input.runIds.length > 0) {
    const runIdClause = `ar.id in (${input.runIds.map(() => "?").join(", ")})`;
    if (input.includeTraceMatches) {
      clauses.push(`(${runIdClause} or ar.thread_id like ?)`);
      params.push(...input.runIds, `%trace=${input.traceId}%`);
    } else {
      clauses.push(runIdClause);
      params.push(...input.runIds);
    }
  } else {
    clauses.push("ar.thread_id like ?");
    params.push(`%trace=${input.traceId}%`);
  }
  if (input.taskId) {
    clauses.push("ar.task_id = ?");
    params.push(input.taskId);
  }
  return await conn.execute<AgentRunRow[]>(
    `select ar.id, ar.task_id, ar.status, ar.thread_id, ar.started_at, ar.created_at, t.dependencies
       from agent_runs ar
       left join tasks t on t.id = ar.task_id
      where ${clauses.join(" and ")}
      order by ar.started_at asc, ar.id asc`,
    params,);
}

async function loadLifecycleEventRows(
  conn: ReturnType<typeof ormSqlConnection>,
  orgId: string,
  projectId: string,
  runIds: string[],
  traceId: string,): Promise<LifecycleEventRow[]> {
  const rows = await conn.execute<LifecycleEventRow[]>(
    `select id, subject_id as run_id, verb, payload, actor, created_at
       from events
      where org_id = ?
        and project_id = ?
        and subject_kind = 'agent_run'
        and subject_id in (${runIds.map(() => "?").join(", ")})
      order by created_at asc, id asc`,
    [orgId, projectId,...runIds],);
  return rows.filter((row) => row.payload?.traceId === traceId);
}

function dispatchToLiveEvent(
  row: DispatchEventRow,
  input: { runId: string; traceId: string; taskId: string | null; sequence: number },): DependencyRunLiveEvent {
  return {
    id: row.id,
    runId: input.runId,
    taskId: input.taskId,
    traceId: input.traceId,
    sequence: input.sequence,
    domain: "executor",
    mutationType: "dependency_tree_dispatched",
    targetKind: "task",
    targetId: input.taskId ?? input.runId,
    agentId: typeof row.payload?.agent === "string" ? row.payload.agent : null,
    taskLineageId: input.traceId,
    summary: "Dependency tree dispatched",
    output: null,
    payload: row.payload ?? {},
    createdAt: isoStamp(row.created_at),
  };
}

function toLiveEvent(
  row: LifecycleEventRow,
  input: { fallbackTraceId: string; fallbackTaskId: string | null; sequence: number },): DependencyRunLiveEvent {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    runId: row.run_id,
    taskId: typeof payload.taskId === "string" ? payload.taskId : input.fallbackTaskId,
    traceId: typeof payload.traceId === "string" ? payload.traceId : input.fallbackTraceId,
    sequence: input.sequence,
    domain: typeof payload.domain === "string" ? payload.domain : "executor",
    mutationType: typeof payload.mutationType === "string" ? payload.mutationType : row.verb,
    targetKind: typeof payload.targetKind === "string" ? payload.targetKind : "agent_run",
    targetId: typeof payload.targetId === "string" ? payload.targetId : row.run_id,
    agentId: typeof payload.agentId === "string" ? payload.agentId : row.actor,
    taskLineageId: typeof payload.taskLineageId === "string" ? payload.taskLineageId : input.fallbackTraceId,
    summary: typeof payload.summary === "string" ? payload.summary : humanizeMutationType(row.verb),
    output: typeof payload.output === "string" ? payload.output : null,
    payload,
    createdAt: isoStamp(row.created_at),
  };
}

function buildExecutorStatus(
  runs: DependencyRunLiveRun[],
  latestEvent: DependencyRunLiveEvent | null,): DependencyRunExecutorStatus {
  const counts = {
    queuedTaskCount: 0,
    runningTaskCount: 0,
    succeededTaskCount: 0,
    failedTaskCount: 0,
    blockedTaskCount: 0,
    inReviewCount: 0,
  };
  for (const run of runs) {
    const status = normalizeStatus(run.status);
    if (status === "queued") counts.queuedTaskCount += 1;
    else if (status === "running") counts.runningTaskCount += 1;
    else if (status === "succeeded") counts.succeededTaskCount += 1;
    else if (status === "failed") counts.failedTaskCount += 1;
    else if (status === "blocked") counts.blockedTaskCount += 1;
    else if (status === "in-review") counts.inReviewCount += 1;
  }
  return {...counts,
    active: counts.queuedTaskCount + counts.runningTaskCount > 0,
    lastActivityAt: latestEvent?.createdAt ?? runs.at(-1)?.lastActivityAt ?? null,
  };
}

function firstEligibleQueuedRun(runs: DependencyRunLiveRun[]): DependencyRunLiveRun | null {
  const statusByTaskId = new Map<string, string>;
  for (const run of runs) {
    if (run.taskId) statusByTaskId.set(run.taskId, normalizeStatus(run.status));
  }
  for (const run of runs) {
    if (normalizeStatus(run.status) !== "queued") continue;
    const dependenciesReady = run.dependencyIds.every((dependencyId) => {
      const dependencyStatus = statusByTaskId.get(dependencyId);
      return !dependencyStatus || dependencyStatus === "succeeded" || dependencyStatus === "in-review";
    });
    if (dependenciesReady) return run;
  }
  return null;
}

async function claimAgentRunJob(
  conn: ReturnType<typeof ormSqlConnection>,
  input: { orgId: string; projectId: string; runId: string; workerId: string },): Promise<ClaimedJobRow | null> {
  const columns = await loadJobColumns(conn);
  const setClauses = ["status = 'running'"];
  const setParams: unknown[] = [];
  if (columns.has("attempts")) setClauses.push("attempts = attempts + 1");
  if (columns.has("locked_by")) {
    setClauses.push("locked_by = ?");
    setParams.push(input.workerId);
  }
  if (columns.has("locked_at")) setClauses.push("locked_at = now()");
  if (columns.has("updated_at")) setClauses.push("updated_at = now()");

  const whereClauses = ["org_id = ?"];
  const whereParams: unknown[] = [input.orgId];
  if (columns.has("project_id")) {
    whereClauses.push("project_id = ?");
    whereParams.push(input.projectId);
  }
  if (columns.has("queue")) {
    whereClauses.push("queue = 'agent-runs'");
  }
  if (columns.has("kind")) {
    whereClauses.push("kind = 'agent_run'");
  }
  whereClauses.push("status = 'queued'");
  whereClauses.push("payload ->> 'run_id' = ?");
  whereParams.push(input.runId);

  const orderColumns = [
    columns.has("available_at") ? "available_at asc" : null,
    columns.has("created_at") ? "created_at asc" : columns.has("scheduled_for") ? "scheduled_for asc" : null,
    "id asc",
  ].filter((column): column is string => Boolean(column));
  const returningColumns = [
    "id",
    columns.has("attempts") ? "attempts" : "1 as attempts",
    columns.has("max_attempts") ? "max_attempts" : "1 as max_attempts",
  ];
  const rows = await conn.execute<ClaimedJobRow[]>(
    `update jobs
        set ${setClauses.join(", ")}
      where id = (
        select id
          from jobs
         where ${whereClauses.join(" and ")}
         order by ${orderColumns.join(", ")}
         limit 1)
      returning ${returningColumns.join(", ")}`,
    [...setParams,...whereParams],);
  return rows[0] ?? null;
}

async function completeAgentRunJob(
  conn: ReturnType<typeof ormSqlConnection>,
  jobId: string,): Promise<void> {
  const columns = await loadJobColumns(conn);
  const setClauses = ["status = 'succeeded'"];
  if (columns.has("locked_by")) setClauses.push("locked_by = null");
  if (columns.has("locked_at")) setClauses.push("locked_at = null");
  if (columns.has("updated_at")) setClauses.push("updated_at = now()");
  await conn.execute(
    `update jobs
        set ${setClauses.join(", ")}
      where id = ?`,
    [jobId],);
}

async function failAgentRunJob(
  conn: ReturnType<typeof ormSqlConnection>,
  job: ClaimedJobRow,
  error: string,): Promise<"queued" | "failed"> {
  const columns = await loadJobColumns(conn);
  const nextStatus = job.attempts < job.max_attempts ? "queued" : "failed";
  const setClauses = ["status = ?"];
  const params: unknown[] = [nextStatus];
  if (columns.has("locked_by")) setClauses.push("locked_by = null");
  if (columns.has("locked_at")) setClauses.push("locked_at = null");
  if (columns.has("last_error")) {
    setClauses.push("last_error = ?");
    params.push(error.slice(0, 500));
  }
  if (columns.has("available_at")) setClauses.push("available_at = now()");
  if (columns.has("updated_at")) setClauses.push("updated_at = now()");
  await conn.execute(
    `update jobs
        set ${setClauses.join(", ")}
      where id = ?
      returning status`,
    [...params, job.id],);
  return nextStatus;
}

async function loadJobColumns(conn: ReturnType<typeof ormSqlConnection>): Promise<Set<string>> {
  const rows = await conn.execute<JobColumnRow[]>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'jobs'`,);
  return new Set(rows.map((row) => row.column_name));
}

async function loadWorkerRun(
  conn: ReturnType<typeof ormSqlConnection>,
  orgId: string,
  runId: string,): Promise<WorkerRunRow | null> {
  const rows = await conn.execute<WorkerRunRow[]>(
    `select ar.id, ar.task_id, ar.agent_name, ar.agent_version, ar.thread_id, ar.status, t.dependencies
       from agent_runs ar
       left join tasks t on t.id = ar.task_id
      where ar.id = ? and ar.org_id = ?`,
    [runId, orgId],);
  return rows[0] ?? null;
}

async function persistWorkerResult(
  conn: ReturnType<typeof ormSqlConnection>,
  orgId: string,
  runId: string,
  result: AgentRunResult,): Promise<void> {
  await conn.execute(
    `update agent_runs
        set iteration_count = ?,
            token_used = ?,
            transcript_path = ?,
            workspace_diff_path = ?,
            transcript_truncated = ?,
            last_codex_timestamp = now()
      where id = ? and org_id = ?`,
    [
      result.iterationCount,
      result.tokenUsed ?? null,
      result.transcriptPath ?? null,
      result.workspaceDiffPath ?? null,
      result.transcriptTruncated ?? false,
      runId,
      orgId,
    ],);
}

function buildWorkerRunRequest(input: {
  input: DependencyRunWorkerTickInput;
  projectId: string;
  traceId: string;
  run: WorkerRunRow;
  liveRun: DependencyRunLiveRun;
}): DependencyRunWorkerRunContext {
  const agent = input.run.agent_name?.trim() || "codex";
  const resolved = resolveAgentRunConfig({
    requestedAgent: agent,
    workflowOverride: {...(input.run.agent_version ? { model: input.run.agent_version } : {}),
    },
  });
  const prompt = input.run.thread_id?.trim() || `Run dependency task ${input.run.task_id ?? input.run.id}`;
  return {
    runId: input.run.id,
    projectId: input.projectId,
    taskId: input.run.task_id,
    traceId: input.traceId,
    agent,
    model: input.run.agent_version ?? null,
    dependencyIds: input.liveRun.dependencyIds,
    queuePosition: input.liveRun.queuePosition,
    worktree: {
      cwd: input.input.cwd ?? process.cwd(),
      branch: `agent/${input.run.id}`,...(input.input.copyToWorktree ? { copyToWorktree: input.input.copyToWorktree } : {}),
    },
    agentProfile: resolved.profile,
    prompt,
    contextBundle: {
      projectId: input.projectId,
      taskId: input.run.task_id,
      traceId: input.traceId,
      dependencyIds: input.liveRun.dependencyIds,
      queuePosition: input.liveRun.queuePosition,
    },
    timeout: resolved.profile.defaultTimeout,
  };
}

async function defaultRunAgent(request: DependencyRunWorkerRunContext): Promise<AgentRunResult> {
  return await runAgent(request);
}

async function workerTickOutput(
  em: EntityManager,
  ctx: AppContext,
  input: {
    projectId: string;
    traceId: string;
    workerId: string;
    run: WorkerRunRow;
    jobId: string;
    status: "succeeded" | "failed" | "queued";
    output: string;
  },): Promise<DependencyRunWorkerTickOutput> {
  return {
    projectId: input.projectId,
    traceId: input.traceId,
    runGroupId: input.traceId,
    workerId: input.workerId,
    processedRun: {
      id: input.run.id,
      taskId: input.run.task_id,
      traceId: input.traceId,
      agent: input.run.agent_name?.trim() || "codex",
      status: input.status,
      output: input.output,
      jobId: input.jobId,
    },
    skippedReason: null,
    feedback: await loadDependencyRunLiveFeedbackForTasks(em, ctx, {
      projectId: input.projectId,
      traceId: input.traceId,
    }),
  };
}

function normalizeStatus(status: string | null | undefined): "queued" | "running" | "succeeded" | "failed" | "blocked" | "in-review" | "other" {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (["queued", "pending", "scheduled"].includes(normalized)) return "queued";
  if (["running", "in-progress", "active", "started"].includes(normalized)) return "running";
  if (["succeeded", "success", "completed", "complete", "done"].includes(normalized)) return "succeeded";
  if (["failed", "error", "timed-out", "retry-exhausted"].includes(normalized)) return "failed";
  if (["blocked", "stuck"].includes(normalized)) return "blocked";
  if (["in-review", "review", "reviewing"].includes(normalized)) return "in-review";
  return "other";
}

function normalizeTaskDependencyIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return normalizeStringArray((value as Record<string, unknown>)["blocked_by"]);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function extractTraceId(threadId: string | null | undefined): string | undefined {
  return threadId?.match(/\btrace=([^\s]+)/)?.[1];
}

function extractTraceIdFromPayload(payload: Record<string, unknown> | null | undefined): string | undefined {
  return typeof payload?.traceId === "string" ? payload.traceId : undefined;
}

function humanizeMutationType(value: string): string {
  const words = value.replaceAll(":", "_").replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
