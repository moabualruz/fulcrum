/**
 * Fulcrum-backed Symphony tracker adapter.
 *
 * C6: app code uses MikroORM repositories/query builders only. Raw SQL is
 * limited to migration classes and test-only planner introspection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";

import type { AgentRun } from "../../db/entities/orchestration/AgentRun.ts";
import type { Task } from "../../db/entities/tasks/Task.ts";
import type { AgentRunRepository } from "../../db/repositories/orchestration/AgentRunRepository.ts";
import type { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";
import {
  AgentRunIssueListSchema,
  AgentRunIssueSchema,
  AgentRunOrchestrationStateSchema,
  CandidateIssueSchema,
  CandidateIssueListSchema,
  FetchCandidateIssuesInputSchema,
  FetchIssuesByStatesInputSchema,
  FetchIssueStatesByIdsInputSchema,
  IssueStateSchema,
  IssueStateListSchema,
  READY_TASK_STATUS,
  TrackerTaskSchema,
  type AgentRunIssue,
  type AgentRunOrchestrationState,
  type CandidateIssue,
  type IssueState,
  type TrackerTask,
} from "./schemas.ts";

export {
  AgentRunIssueListSchema,
  AgentRunIssueSchema,
  AgentRunOrchestrationStateSchema,
  CandidateIssueSchema,
  CandidateIssueListSchema,
  FetchCandidateIssuesInputSchema,
  FetchIssuesByStatesInputSchema,
  FetchIssueStatesByIdsInputSchema,
  IssueStateSchema,
  IssueStateListSchema,
  READY_TASK_STATUS,
  TrackerTaskSchema,
} from "./schemas.ts";
export type { AgentRunIssue, CandidateIssue, IssueState, TrackerTask } from "./schemas.ts";

const RESOLVED_BLOCKER_STATUSES = new Set([
  "closed",
  "done",
  "duplicate",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
]);

const OCCUPIED_TASK_ORCHESTRATION_STATES = [
  "claimed",
  "running",
  "retry_queued",
] satisfies AgentRunOrchestrationState[];

export function buildCandidateIssuesBaseQuery(
  taskRepo: TaskRepository,
  orgId: string,
) {
  return taskRepo
    .createQueryBuilder("task")
    .select("*")
    .where({ org: orgId, status: READY_TASK_STATUS } as never)
    .orderBy({ priority: "asc", createdAt: "asc", id: "asc" });
}

export async function fetchCandidateIssues(
  em: EntityManager,
  orgId: string,
  limit = 50,
): Promise<CandidateIssue[]> {
  const input = FetchCandidateIssuesInputSchema.parse({ orgId, limit });
  const [{ AgentRun }, { Task }] = await Promise.all([
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/tasks/Task.ts"),
  ]);
  const fork = em.fork();
  const taskRepo = fork.getRepository(Task) as TaskRepository;
  const agentRunRepo = fork.getRepository(AgentRun) as AgentRunRepository;

  const readyTasks = await buildCandidateIssuesBaseQuery(
    taskRepo,
    input.orgId,
  ).getResultList();
  if (readyTasks.length === 0) return [];

  const claimedTaskIds = await fetchClaimedTaskIds(
    agentRunRepo,
    input.orgId,
    readyTasks.map((task) => task.id),
  );
  const blockerStatusById = await fetchBlockerStatusById(
    taskRepo,
    input.orgId,
    readyTasks,
  );

  const candidates = readyTasks
    .filter((task) => !claimedTaskIds.has(task.id))
    .filter((task) => blockersResolved(task, blockerStatusById))
    .slice(0, input.limit)
    .map(toCandidateIssue);

  return CandidateIssueListSchema.parse(candidates);
}

export async function fetchIssuesByStates(
  em: EntityManager,
  orgId: string,
  states: readonly AgentRunOrchestrationState[],
  limit = 50,
): Promise<AgentRunIssue[]> {
  const input = FetchIssuesByStatesInputSchema.parse({ orgId, states, limit });
  if (input.states.length === 0) return [];

  const { AgentRun } = await import(
    "../../db/entities/orchestration/AgentRun.ts"
  );
  const fork = em.fork();
  const agentRunRepo = fork.getRepository(AgentRun) as AgentRunRepository;

  const runs = await agentRunRepo.find(
    {
      org: input.orgId,
      orchestrationState: { $in: input.states },
    } as never,
    {
      limit: input.limit,
      populate: ["task"],
      orderBy: issueStateOrderBy(input.states),
    },
  );

  return AgentRunIssueListSchema.parse(runs.map(toAgentRunIssue));
}

function issueStateOrderBy(
  states: readonly AgentRunOrchestrationState[],
) {
  const stateSet = new Set(states);
  if (
    stateSet.size > 0 &&
    [...stateSet].every((state) =>
      state === "unclaimed" || state === "retry_queued"
    )
  ) {
    return { nextRetryAt: "asc", id: "asc" } as const;
  }

  if (stateSet.size === 1 && stateSet.has("running")) {
    return { startedAt: "asc", id: "asc" } as const;
  }

  return { id: "asc" } as const;
}

export async function fetchIssueStatesByIds(
  em: EntityManager,
  orgId: string,
  runIds: readonly string[],
): Promise<IssueState[]> {
  const input = FetchIssueStatesByIdsInputSchema.parse({ orgId, runIds });
  if (input.runIds.length === 0) return [];

  const { AgentRun } = await import(
    "../../db/entities/orchestration/AgentRun.ts"
  );
  const fork = em.fork();
  const agentRunRepo = fork.getRepository(AgentRun) as AgentRunRepository;

  const runs = await agentRunRepo.find(
    {
      id: { $in: input.runIds },
      org: input.orgId,
    } as never,
    {
      fields: ["id", "orchestrationState"],
      orderBy: { id: "asc" },
    },
  );

  const states = runs
    .filter((run) => run.orchestrationState !== undefined)
    .map((run) => ({
      id: run.id,
      state: run.orchestrationState,
    }));

  return IssueStateListSchema.parse(states);
}

async function fetchClaimedTaskIds(
  agentRunRepo: AgentRunRepository,
  orgId: string,
  taskIds: readonly string[],
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();

  const claimedRuns = await agentRunRepo.find(
    {
      org: orgId,
      orchestrationState: { $in: OCCUPIED_TASK_ORCHESTRATION_STATES },
      task: { id: { $in: [...taskIds] } },
    } as never,
    { populate: ["task"] },
  );

  return new Set(
    claimedRuns
      .map((run) => run.task?.id)
      .filter((taskId): taskId is string => typeof taskId === "string"),
  );
}

async function fetchBlockerStatusById(
  taskRepo: TaskRepository,
  orgId: string,
  tasks: readonly Task[],
): Promise<Map<string, string | null>> {
  const blockerIds = [
    ...new Set(tasks.flatMap((task) => task.blockedByIds ?? [])),
  ];
  if (blockerIds.length === 0) return new Map();

  const blockers = await taskRepo.find({
    org: orgId,
    id: { $in: blockerIds },
  } as never);

  return new Map(blockers.map((task) => [task.id, task.status]));
}

function blockersResolved(
  task: Task,
  statusById: ReadonlyMap<string, string | null>,
): boolean {
  const blockerIds = task.blockedByIds ?? [];
  if (blockerIds.length === 0) return true;

  return blockerIds.every((blockerId) =>
    isResolvedBlockerStatus(statusById.get(blockerId) ?? null),
  );
}

function isResolvedBlockerStatus(status: string | null): boolean {
  if (!status) return false;
  return RESOLVED_BLOCKER_STATUSES.has(status.toLowerCase());
}

function toCandidateIssue(task: Task): CandidateIssue {
  return {
    id: task.id,
    // Task title/identifier are Pillar 6 columns; current orchestration stub uses
    // the stable task id for both contract fields until that domain lands.
    identifier: task.id,
    title: task.id,
    state: READY_TASK_STATUS,
    status: READY_TASK_STATUS,
    priority: task.priority,
    createdAt: task.createdAt,
    blockedByIds: task.blockedByIds ?? [],
    workflowId: task.workflowId,
  };
}

function toAgentRunIssue(run: AgentRun): AgentRunIssue {
  const state = AgentRunOrchestrationStateSchema.parse(
    run.orchestrationState,
  );

  return {
    id: run.id,
    state,
    orchestrationState: state,
    task: run.task ? toTrackerTask(run.task) : null,
    startedAt: run.startedAt,
    attemptCount: run.attemptCount,
    nextRetryAt: run.nextRetryAt ?? null,
    workspacePath: run.workspacePath ?? null,
    lastErrorKind: run.lastErrorKind ?? null,
  };
}

function toTrackerTask(task: Task): TrackerTask {
  return {
    id: task.id,
    status: task.status,
    priority: task.priority,
    createdAt: task.createdAt,
    blockedByIds: task.blockedByIds ?? [],
    workflowId: task.workflowId,
  };
}
