import { randomUUID } from "node:crypto";
import { DataSource, In, IsNull, type EntityManager } from "typeorm";

import { FulcrumJobEntity } from "@platform-core/infrastructure/database/job-queue.entities.ts";
import {
  type FulcrumAgentRun,
  FulcrumAgentRunEntity,
  FulcrumProjectEntity,
  type FulcrumTask,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface AgentRunPublicRow {
  id: string;
  projectId: string;
  taskId: string | null;
  traceId: string;
  status: string;
  state: string;
  dependencyTree: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AgentRunPublicStatus {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

export interface AgentRunCandidateRow {
  id: string;
  identifier: string;
  title: string;
  state: string;
  status: "ready";
  priority: number | null;
  createdAt: Date;
  blockedByIds: string[];
  workflowId: string | null;
}

export interface AgentRunIssueRow {
  id: string;
  state: string;
  orchestrationState: string;
  task: {
    id: string;
    status: string;
    priority: number | null;
    createdAt: Date;
    blockedByIds: string[];
    workflowId: string | null;
  } | null;
  startedAt: Date;
  attemptCount: number;
  nextRetryAt: Date | null;
  workspacePath: string | null;
  lastErrorKind: string | null;
}

const READY_TASK_STATUS = "ready";
const OCCUPIED_RUN_STATUSES = ["queued", "claimed", "running", "retry_queued"];
const BLOCKING_DEPENDENCY_KINDS = ["task_dependency", "blocks", "blocks_execution"];
const RESOLVED_TASK_STATUSES = new Set([
  "closed",
  "done",
  "duplicate",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
]);

export class AgentRunPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async loadStatus(input: { orgId: string }): Promise<AgentRunPublicStatus> {
    const runs = await this.loadRunsForOrg(input.orgId, {});
    return runs.reduce<AgentRunPublicStatus>((status, run) => {
      status.total += 1;
      const bucket = statusBucket(run.status);
      status[bucket] += 1;
      return status;
    }, {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 0,
    });
  }

  async loadRun(input: { orgId: string; identifier: string }): Promise<AgentRunPublicRow | null> {
    const projectIds = await this.projectIdsForOrg(input.orgId);
    if (projectIds.length === 0) return null;

    const run = await this.repository().findOne({
      where: [
        { id: input.identifier, projectId: In(projectIds) },
        { traceId: input.identifier, projectId: In(projectIds) },
      ],
    });
    return run ? toPublicRow(run) : null;
  }

  async listRuns(input: { orgId: string; limit?: number; offset?: number }): Promise<AgentRunPublicRow[]> {
    return await this.loadRunsForOrg(input.orgId, {
      limit: input.limit,
      offset: input.offset,
    });
  }

  async listCandidateIssues(input: { orgId: string; limit?: number }): Promise<AgentRunCandidateRow[]> {
    const projectIds = await this.projectIdsForOrg(input.orgId);
    if (projectIds.length === 0) return [];

    const readyTasks = await this.dataSource.getRepository(FulcrumTaskEntity).find({
      where: {
        projectId: In(projectIds),
        status: READY_TASK_STATUS,
        deletedAt: IsNull(),
      },
      order: { priority: "ASC", createdAt: "ASC", id: "ASC" },
    });
    if (readyTasks.length === 0) return [];

    const taskIds = readyTasks.map((task) => task.id);
    const [occupiedRuns, dependencies] = await Promise.all([
      this.repository().find({
        where: {
          projectId: In(projectIds),
          taskId: In(taskIds),
          status: In(OCCUPIED_RUN_STATUSES),
        },
        select: ["taskId"],
      }),
      this.dataSource.getRepository(FulcrumTaskDependencyEntity).find({
        where: {
          projectId: In(projectIds),
          taskId: In(taskIds),
          dependencyKind: In(BLOCKING_DEPENDENCY_KINDS),
        },
      }),
    ]);

    const occupiedTaskIds = new Set(
      occupiedRuns.map((run) => run.taskId).filter((id): id is string => Boolean(id)),
    );
    const dependencyIdsByTaskId = groupDependencyIdsByTaskId(dependencies);
    const blockerStatusById = await this.blockerStatusById(projectIds, dependencyIdsByTaskId);

    return readyTasks
      .filter((task) => !occupiedTaskIds.has(task.id))
      .filter((task) => blockersResolved(dependencyIdsByTaskId.get(task.id) ?? [], blockerStatusById))
      .slice(0, input.limit ?? 50)
      .map((task) => toCandidateRow(task, dependencyIdsByTaskId.get(task.id) ?? []));
  }

  async listRunIssuesByStates(input: {
    orgId: string;
    states: string[];
    limit?: number;
  }): Promise<AgentRunIssueRow[]> {
    if (input.states.length === 0) return [];
    const projectIds = await this.projectIdsForOrg(input.orgId);
    if (projectIds.length === 0) return [];

    const runs = await this.repository().find({
      where: {
        projectId: In(projectIds),
        status: In(input.states),
      },
      order: { createdAt: "ASC", id: "ASC" },
      take: input.limit ?? 50,
    });
    if (runs.length === 0) return [];

    const taskIds = runs.map((run) => run.taskId).filter((id): id is string => Boolean(id));
    const taskById = await this.taskById(projectIds, taskIds);
    const dependencyIdsByTaskId = await this.dependencyIdsByTaskId(projectIds, taskIds);

    return runs.map((run) =>
      toIssueRow(
        run,
        taskById.get(run.taskId ?? ""),
        dependencyIdsByTaskId.get(run.taskId ?? "") ?? [],
      )
    );
  }

  async dispatchRun(input: {
    orgId: string;
    projectId?: string | null;
    taskId?: string | null;
    traceId?: string | null;
    dependencyTree?: string[];
    agent?: string | null;
  }): Promise<AgentRunPublicRow | null> {
    const projectId = await this.projectIdForDispatch(input);
    if (!projectId) return null;
    const id = randomUUID();
    return await this.dataSource.transaction(async (manager) => {
      const run = manager.getRepository(FulcrumAgentRunEntity).create({
        id,
        projectId,
        taskId: input.taskId ?? null,
        traceId: input.traceId?.trim() || `run-${id}`,
        status: "queued",
        dependencyTree: input.dependencyTree ?? [],
      });
      const saved = await manager.getRepository(FulcrumAgentRunEntity).save(run);
      await this.enqueueAgentRunJob(manager, {
        orgId: input.orgId,
        projectId,
        runId: saved.id,
        taskId: saved.taskId,
        traceId: saved.traceId,
        agent: input.agent ?? null,
      });
      return toPublicRow(saved);
    });
  }

  async cancelRun(input: { orgId: string; identifier: string }): Promise<{ ok: true }> {
    const run = await this.loadRunEntity(input);
    if (!run || isTerminalStatus(run.status)) return { ok: true };
    run.status = "cancelled";
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FulcrumAgentRunEntity).save(run);
      await this.cancelAgentRunJobs(manager, {
        orgId: input.orgId,
        runId: run.id,
      });
    });
    return { ok: true };
  }

  async retryRun(input: { orgId: string; identifier: string }): Promise<AgentRunPublicRow | null> {
    const source = await this.loadRunEntity(input);
    if (!source) return null;
    const id = randomUUID();
    return await this.dataSource.transaction(async (manager) => {
      const run = manager.getRepository(FulcrumAgentRunEntity).create({
        id,
        projectId: source.projectId,
        taskId: source.taskId,
        traceId: source.traceId,
        status: "queued",
        dependencyTree: source.dependencyTree,
      });
      const saved = await manager.getRepository(FulcrumAgentRunEntity).save(run);
      await this.enqueueAgentRunJob(manager, {
        orgId: input.orgId,
        projectId: saved.projectId,
        runId: saved.id,
        taskId: saved.taskId,
        traceId: saved.traceId,
        agent: null,
      });
      return toPublicRow(saved);
    });
  }

  private async loadRunEntity(input: { orgId: string; identifier: string }): Promise<FulcrumAgentRun | null> {
    const projectIds = await this.projectIdsForOrg(input.orgId);
    if (projectIds.length === 0) return null;
    return await this.repository().findOne({
      where: [
        { id: input.identifier, projectId: In(projectIds) },
        { traceId: input.identifier, projectId: In(projectIds) },
      ],
    });
  }

  private async projectIdForDispatch(input: {
    orgId: string;
    projectId?: string | null;
    taskId?: string | null;
  }): Promise<string | null> {
    if (input.projectId) {
      const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOne({
        where: { id: input.projectId, workspaceId: input.orgId },
        select: ["id"],
      });
      return project?.id ?? null;
    }
    if (!input.taskId) return null;
    const task = await this.dataSource.getRepository(FulcrumTaskEntity).findOne({
      where: { id: input.taskId },
      select: ["projectId"],
    });
    if (!task) return null;
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOne({
      where: { id: task.projectId, workspaceId: input.orgId },
      select: ["id"],
    });
    return project?.id ?? null;
  }

  private async loadRunsForOrg(
    orgId: string,
    options: { limit?: number; offset?: number },
  ): Promise<AgentRunPublicRow[]> {
    const projectIds = await this.projectIdsForOrg(orgId);
    if (projectIds.length === 0) return [];

    const runs = await this.repository().find({
      where: { projectId: In(projectIds) },
      order: { createdAt: "DESC", id: "ASC" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return runs.map(toPublicRow);
  }

  private async projectIdsForOrg(orgId: string): Promise<string[]> {
    const projects = await this.dataSource.getRepository(FulcrumProjectEntity).find({
      where: { workspaceId: orgId },
      select: ["id"],
    });
    return projects.map((project) => project.id);
  }

  private repository() {
    return this.dataSource.getRepository(FulcrumAgentRunEntity);
  }

  private async taskById(projectIds: string[], taskIds: string[]): Promise<Map<string, FulcrumTask>> {
    if (taskIds.length === 0) return new Map();
    const tasks = await this.dataSource.getRepository(FulcrumTaskEntity).find({
      where: { projectId: In(projectIds), id: In(taskIds) },
    });
    return new Map(tasks.map((task) => [task.id, task]));
  }

  private async dependencyIdsByTaskId(projectIds: string[], taskIds: string[]): Promise<Map<string, string[]>> {
    if (taskIds.length === 0) return new Map();
    const dependencies = await this.dataSource.getRepository(FulcrumTaskDependencyEntity).find({
      where: {
        projectId: In(projectIds),
        taskId: In(taskIds),
        dependencyKind: In(BLOCKING_DEPENDENCY_KINDS),
      },
    });
    return groupDependencyIdsByTaskId(dependencies);
  }

  private async blockerStatusById(
    projectIds: string[],
    dependencyIdsByTaskId: Map<string, string[]>,
  ): Promise<Map<string, string>> {
    const blockerIds = [...new Set([...dependencyIdsByTaskId.values()].flat())];
    if (blockerIds.length === 0) return new Map();
    const blockers = await this.dataSource.getRepository(FulcrumTaskEntity).find({
      where: { projectId: In(projectIds), id: In(blockerIds) },
      select: ["id", "status"],
    });
    return new Map(blockers.map((task) => [task.id, task.status]));
  }

  private async enqueueAgentRunJob(
    manager: EntityManager,
    input: {
      orgId: string;
      projectId: string;
      runId: string;
      taskId: string | null;
      traceId: string;
      agent: string | null;
    },
  ): Promise<void> {
    await manager.getRepository(FulcrumJobEntity).save({
      id: randomUUID(),
      orgId: input.orgId,
      projectId: input.projectId,
      queue: "agent-runs",
      kind: "agent_run",
      payload: {
        run_id: input.runId,
        runId: input.runId,
        task_id: input.taskId,
        taskId: input.taskId,
        traceId: input.traceId,
        agent: input.agent,
      },
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      availableAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: null,
    });
  }

  private async cancelAgentRunJobs(
    manager: EntityManager,
    input: { orgId: string; runId: string },
  ): Promise<void> {
    await manager.getRepository(FulcrumJobEntity)
      .createQueryBuilder()
      .update()
      .set({
        status: "cancelled",
        lockedBy: null,
        lockedAt: null,
      })
      .where("org_id = :orgId", { orgId: input.orgId })
      .andWhere("payload ->> 'run_id' = :runId", { runId: input.runId })
      .andWhere("status IN (:...statuses)", { statuses: ["queued", "running"] })
      .execute();
  }
}

function statusBucket(status: string): keyof Omit<AgentRunPublicStatus, "total"> {
  if (["running", "in_progress", "active"].includes(status)) return "running";
  if (["completed", "succeeded", "done"].includes(status)) return "completed";
  if (["failed", "error", "cancelled"].includes(status)) return "failed";
  return "queued";
}

function isTerminalStatus(status: string): boolean {
  return ["completed", "succeeded", "failed", "cancelled", "done"].includes(status);
}

function groupDependencyIdsByTaskId(
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const dependency of dependencies) {
    result.set(dependency.taskId, [
      ...(result.get(dependency.taskId) ?? []),
      dependency.dependsOnTaskId,
    ]);
  }
  return result;
}

function blockersResolved(
  dependencyIds: string[],
  statusById: Map<string, string>,
): boolean {
  return dependencyIds.every((dependencyId) => {
    const status = statusById.get(dependencyId);
    return status ? RESOLVED_TASK_STATUSES.has(status.toLowerCase()) : false;
  });
}

function toCandidateRow(task: FulcrumTask, blockedByIds: string[]): AgentRunCandidateRow {
  return {
    id: task.id,
    identifier: task.externalId ?? task.id,
    title: task.title || task.externalId || task.id,
    state: READY_TASK_STATUS,
    status: READY_TASK_STATUS,
    priority: task.priority,
    createdAt: task.createdAt ?? new Date(0),
    blockedByIds,
    workflowId: null,
  };
}

function toIssueRow(
  run: FulcrumAgentRun,
  task: FulcrumTask | undefined,
  blockedByIds: string[],
): AgentRunIssueRow {
  return {
    id: run.id,
    state: run.status,
    orchestrationState: run.status,
    task: task
      ? {
        id: task.id,
        status: task.status,
        priority: task.priority,
        createdAt: task.createdAt ?? new Date(0),
        blockedByIds,
        workflowId: null,
      }
      : null,
    startedAt: run.createdAt ?? new Date(0),
    attemptCount: 1,
    nextRetryAt: null,
    workspacePath: null,
    lastErrorKind: null,
  };
}

function toPublicRow(run: FulcrumAgentRun): AgentRunPublicRow {
  return {
    id: run.id,
    projectId: run.projectId,
    taskId: run.taskId,
    traceId: run.traceId,
    status: run.status,
    state: run.status,
    dependencyTree: run.dependencyTree,
    createdAt: run.createdAt?.toISOString() ?? null,
    updatedAt: run.updatedAt?.toISOString() ?? null,
  };
}
