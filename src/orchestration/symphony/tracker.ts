/**
 * Fulcrum-backed Symphony tracker adapter.
 *
 * C6: app code uses MikroORM repositories/query builders only. Raw SQL is
 * limited to migration classes and test-only planner introspection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";

import {
  AGENT_RUN_ORCHESTRATION_STATES,
  type AgentRun,
} from "../../db/entities/orchestration/AgentRun.ts";
import type { Task } from "../../db/entities/tasks/Task.ts";
import type { AgentRunRepository } from "../../db/repositories/orchestration/AgentRunRepository.ts";
import type { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";

export const READY_TASK_STATUS = "ready";

const FulcrumUuidSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
);

const RESOLVED_BLOCKER_STATUSES = new Set([
  "closed",
  "done",
  "duplicate",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
]);

export const FetchCandidateIssuesInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  limit: z.number().int().min(1).max(500).default(50),
});

export const CandidateIssueSchema = z.object({
  id: FulcrumUuidSchema,
  identifier: z.string(),
  title: z.string(),
  state: z.string(),
  status: z.literal(READY_TASK_STATUS),
  priority: z.number().int().nullable(),
  createdAt: z.date(),
  blockedByIds: z.array(FulcrumUuidSchema),
  workflowId: FulcrumUuidSchema.nullable(),
});

export const CandidateIssueListSchema = z.array(CandidateIssueSchema);

export type CandidateIssue = z.infer<typeof CandidateIssueSchema>;

export const AgentRunOrchestrationStateSchema = z.enum(
  AGENT_RUN_ORCHESTRATION_STATES,
);

export const FetchIssuesByStatesInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  states: z.array(AgentRunOrchestrationStateSchema).max(50),
  limit: z.number().int().min(1).max(500).default(50),
});

export const FetchIssueStatesByIdsInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  runIds: z.array(FulcrumUuidSchema).max(500),
});

export const TrackerTaskSchema = z.object({
  id: FulcrumUuidSchema,
  status: z.string().nullable(),
  priority: z.number().int().nullable(),
  createdAt: z.date(),
  blockedByIds: z.array(FulcrumUuidSchema),
  workflowId: FulcrumUuidSchema.nullable(),
});

export const AgentRunIssueSchema = z.object({
  id: FulcrumUuidSchema,
  state: AgentRunOrchestrationStateSchema,
  orchestrationState: AgentRunOrchestrationStateSchema,
  task: TrackerTaskSchema.nullable(),
  startedAt: z.date(),
  attemptCount: z.number().int(),
  nextRetryAt: z.date().nullable(),
  workspacePath: z.string().nullable(),
  lastErrorKind: z.string().nullable(),
});

export const AgentRunIssueListSchema = z.array(AgentRunIssueSchema);

export const IssueStateSchema = z.object({
  id: FulcrumUuidSchema,
  state: AgentRunOrchestrationStateSchema,
});

export const IssueStateListSchema = z.array(IssueStateSchema);

export type AgentRunIssue = z.infer<typeof AgentRunIssueSchema>;
export type IssueState = z.infer<typeof IssueStateSchema>;

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
  states: readonly z.infer<typeof AgentRunOrchestrationStateSchema>[],
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
  states: readonly z.infer<typeof AgentRunOrchestrationStateSchema>[],
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
      orchestrationState: "claimed",
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

function toTrackerTask(task: Task): z.infer<typeof TrackerTaskSchema> {
  return {
    id: task.id,
    status: task.status,
    priority: task.priority,
    createdAt: task.createdAt,
    blockedByIds: task.blockedByIds ?? [],
    workflowId: task.workflowId,
  };
}
