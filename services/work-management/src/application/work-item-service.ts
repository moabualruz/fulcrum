import type { EntityManager } from "typeorm";

import {
  AppConflictError,
  AppForbiddenError,
  AppNotFoundError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { type TaskDependencies } from "@work-management/infrastructure/database/entities/tasks/schemas.ts";
import { TaskRepository } from "@work-management/infrastructure/database/repositories/tasks/TaskRepository.ts";
import { tipTapDocToText, type TipTapJson } from "@platform-core/infrastructure/application-database/tasks-rich-text.ts";
import { FieldDependencyRule } from "@work-management/infrastructure/database/entities/tasks/FieldDependencyRule.ts";
import { WorkflowRulesService } from "@work-management/application/workflow-rules-service.ts";
import { WorkItemCommentService } from "@work-management/application/work-item-comments.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface TaskOutput {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  descriptionText: string;
  tiptapContent: TipTapJson;
  status: string | null;
  priority: number | null;
  points: number | null;
  parentId: string | null;
  dependencies: TaskDependencies;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface BulkTaskPatch {
  title?: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: TipTapJson;
  status?: string | null;
  priority?: number | null;
  points?: number | null;
  assignee?: string | null;
  label?: string | null;
  sprintId?: string | null;
  projectId?: string | null;
}

interface TaskContext {
  orgId: string;
  userId: string | null;
  em: EntityManager | null;
}

// ── Service ────────────────────────────────────────────────────────

export class WorkItemService {
  constructor(private readonly em: EntityManager) {}

  // ── Queries ────────────────────────────────────────────────────

  async list(orgId: string, includeDeleted = false): Promise<TaskOutput[]> {
    const repo = this.repo();
    const tasks = await repo.list({ orgId, includeDeleted });
    return tasks.map(serializeTask);
  }

  async get(orgId: string, id: string): Promise<TaskOutput | null> {
    const repo = this.repo();
    const task = await repo.get({ orgId, id });
    return task ? serializeTask(task) : null;
  }

  async listChildren(orgId: string, taskId: string): Promise<TaskOutput[]> {
    const repo = this.repo();
    const task = await repo.get({ orgId, id: taskId });
    if (!task) return [];
    const children = await this.em.find(Task, { where: { org: { id: orgId }, parent: taskId, deletedAt: null } as never, order: { createdAt: "ASC", id: "ASC" } });
    return children.map(serializeTask);
  }

  // ── Mutations ──────────────────────────────────────────────────

  async create(orgId: string, input: {
    title: string;
    description?: string | null;
    descriptionText?: string;
    tiptapContent?: TipTapJson;
    status?: string | null;
    priority?: number | null;
    points?: number | null;
  }): Promise<TaskOutput> {
    const repo = this.repo();
    const task = repo.create({ orgId, ...input });
    
    return serializeTask(task);
  }

  async update(orgId: string, input: {
    id: string;
    title?: string;
    description?: string | null;
    descriptionText?: string;
    tiptapContent?: TipTapJson;
    status?: string | null;
    priority?: number | null;
    points?: number | null;
    assigneeId?: string | null;
    projectId?: string | null;
  }): Promise<TaskOutput | null> {
    const repo = this.repo();

    // Fetch current task to determine field changes
    const current = await repo.get({ orgId, id: input.id });
    if (!current) return null;

    // D-24: Transition validation — only when status changes and projectId is known
    if (input.status !== undefined && input.status !== current.status) {
      const projectId = input.projectId ?? current.projectId;
      if (projectId) {
        const wfService = new WorkflowRulesService(this.em);
        const result = await wfService.validateTransition(orgId, projectId, current.status ?? "", input.status ?? "");
        if (!result.allowed) {
          throw new AppForbiddenError(
            result.reason ?? `Transition from '${current.status}' to '${input.status}' is not allowed.`,
          );
        }
      }
    }

    // D-25: startedAt — set when entering a 'started'-category status
    const STARTED_STATUSES = new Set(["in_progress", "started", "active"]);
    const isStartingNow =
      input.status !== undefined &&
      input.status !== current.status &&
      STARTED_STATUSES.has(input.status ?? "") &&
      !current.startedAt;

    const task = await repo.update({ orgId, ...input });
    if (!task) return null;

    if (isStartingNow) {
      task.startedAt = new Date();
      await this.em.save(task);
    }

    // D-08: Watcher auto-subscribe on assignee change
    if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId && input.assigneeId) {
      try {
        const commentService = new WorkItemCommentService(this.em);
        await commentService.subscribe(orgId, task.id, input.assigneeId, "assign");
      } catch {
        // Non-fatal: watcher subscription is best-effort
      }
    }

    // HIGH-03: Inline field dependency validation
    if (input.projectId ?? current.projectId) {
      const projectId = (input.projectId ?? current.projectId)!;
      await validateFieldDependencies(this.em, orgId, projectId, task);
    }

    return serializeTask(task);
  }

  async delete(orgId: string, id: string): Promise<TaskOutput | null> {
    const repo = this.repo();
    const task = await repo.delete({ orgId, id });
    return task ? serializeTask(task) : null;
  }

  async bulkUpdate(ctx: TaskContext, ids: string[], patch: BulkTaskPatch): Promise<{ updated: number }> {
    // D-75: hard cap at 200 tasks per bulk operation
    if (ids.length > 200) {
      throw new AppValidationError("Bulk operations are limited to 200 tasks at a time.");
    }
    const repo = this.repo();
    await this.em.transaction(async (txEm) => {
      const tasks = await findBulkTasksOrThrow(txEm, ctx.orgId, ids);
      for (const task of tasks) {
        applyBulkPatch(task, patch);
        await txEm.save(task);
        await emitTaskEvent({ ...ctx, em: txEm as EntityManager }, {
          verb: "bulk_updated",
          taskId: task.id,
          payload: { patch },
        });
      }
      if (patch.projectId !== undefined) {
        await txEm.query(
          `insert into projects (id, org_id, name)
           select ?, ?, 'Untitled project'
           where ? is not null
             and exists (select 1 from sprints where org_id = ? and project_id = ?)
             and not exists (select 1 from projects where org_id = ? and id = ?)
           on conflict do nothing`,
          [patch.projectId, ctx.orgId, patch.projectId, ctx.orgId, patch.projectId, ctx.orgId, patch.projectId],
        );
        await txEm.query(
          `update tasks
           set project_id = case
             when ? is null then null
             when exists (select 1 from projects where org_id = ? and id = ?) then ?
             when exists (select 1 from sprints where org_id = ? and project_id = ?) then ?
             else project_id
           end,
           updated_at = now()
           where org_id = ? and id in (${ids.map(() => "?").join(", ")})`,
          [patch.projectId, ctx.orgId, patch.projectId, patch.projectId, ctx.orgId, patch.projectId, patch.projectId, ctx.orgId, ...ids],
        );
      }
    });
    return { updated: ids.length };
  }

  async bulkDelete(ctx: TaskContext, ids: string[]): Promise<{ deleted: number }> {
    // D-75: hard cap at 200 tasks per bulk operation
    if (ids.length > 200) {
      throw new AppValidationError("Bulk operations are limited to 200 tasks at a time.");
    }
    await this.em.transaction(async (txEm) => {
      const tasks = await findBulkTasksOrThrow(txEm, ctx.orgId, ids);
      const deletedAt = new Date();
      for (const task of tasks) {
        task.deletedAt = deletedAt;
        task.updatedAt = deletedAt;
        await txEm.save(task);
        await emitTaskEvent({ ...ctx, em: txEm as EntityManager }, {
          verb: "bulk_deleted",
          taskId: task.id,
          payload: { deletedAt },
        });
      }
    });
    return { deleted: ids.length };
  }

  async setParent(ctx: TaskContext, taskId: string, parentId: string | null): Promise<TaskOutput | null> {
    const repo = this.repo();
    const task = await findTaskOrNull(repo, ctx.orgId, taskId);
    if (!task) return null;

    const parent = parentId ? await findTaskOrNull(repo, ctx.orgId, parentId) : null;
    if (parentId && !parent) return null;

    await assertParentDoesNotCycle({ repo, orgId: ctx.orgId, taskId: task.id, parentId });

    const previousParentId = task.parent?.id ?? null;
    task.parent = parent;
    task.updatedAt = new Date();
    await this.em.save(task);
    await emitTaskEvent(ctx, {
      verb: "parent_changed",
      taskId: task.id,
      payload: { previousParentId, parentId },
    });
    
    return serializeTask(task);
  }

  async setDependencies(
    ctx: TaskContext,
    taskId: string,
    dependencies: TaskDependencies,
  ): Promise<TaskOutput | null> {
    const repo = this.repo();
    const task = await findTaskOrNull(repo, ctx.orgId, taskId);
    if (!task) return null;

    const referencedIds = new Set([...dependencies.blocks, ...dependencies.blocked_by]);
    referencedIds.delete(task.id);
    if (referencedIds.size !== dependencies.blocks.length + dependencies.blocked_by.length) {
      throw new AppConflictError("Task dependency cycle rejected.");
    }

    const tasks = await this.em.find(Task, { where: { org: { id: ctx.orgId }, deletedAt: null } as never });
    const knownIds = new Set(tasks.map((c) => c.id));
    if ([...referencedIds].some((id) => !knownIds.has(id))) return null;

    const normalizedDeps: TaskDependencies = {
      blocks: normalizedUnique(dependencies.blocks),
      blocked_by: normalizedUnique(dependencies.blocked_by),
    };
    const edges = replaceTaskDependencyEdges({ taskId: task.id, tasks, dependencies: normalizedDeps });
    assertDependencyGraphDoesNotCycle(edges);

    for (const candidate of tasks) {
      const nextDependencies = dependenciesForTask(candidate.id, edges);
      if (
        candidate.dependencies.blocks.join("\0") !== nextDependencies.blocks.join("\0") ||
        candidate.dependencies.blocked_by.join("\0") !== nextDependencies.blocked_by.join("\0")
      ) {
        candidate.dependencies = nextDependencies;
        candidate.updatedAt = new Date();
        await this.em.save(candidate);
      }
    }

    await emitTaskEvent(ctx, {
      verb: "dependency_updated",
      taskId: task.id,
      payload: { dependencies: task.dependencies },
    });
    
    return serializeTask(task);
  }

  // ── Private ────────────────────────────────────────────────────

  private repo(): TaskRepository {
    return this.em.getRepository(Task) as unknown as TaskRepository;
  }
}

// ── Pure helpers (moved from router) ─────────────────────────────

export function serializeTask(task: Task): TaskOutput {
  return {
    id: task.id,
    orgId: task.org.id,
    title: task.title,
    description: task.description,
    descriptionText: tipTapDocToText(task.tiptapContent as TipTapJson),
    tiptapContent: task.tiptapContent as TipTapJson,
    status: task.status,
    priority: task.priority,
    points: task.points ?? null,
    parentId: task.parent?.id ?? null,
    dependencies: task.dependencies,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

function applyBulkPatch(task: Task, patch: BulkTaskPatch): void {
  if (patch.title !== undefined) task.title = patch.title;
  if (patch.description !== undefined) task.description = patch.description;
  if (patch.descriptionText !== undefined) task.tiptapContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: patch.descriptionText }] }],
  };
  if (patch.tiptapContent !== undefined) task.tiptapContent = patch.tiptapContent;
  if (patch.status !== undefined) task.status = patch.status;
  if (patch.priority !== undefined) task.priority = patch.priority;
  if (patch.points !== undefined) task.points = patch.points;
  if (patch.sprintId !== undefined) task.sprint = patch.sprintId;
  if (patch.assignee !== undefined || patch.label !== undefined) {
    const customFields = { ...task.customFields };
    if (patch.assignee !== undefined) {
      if (patch.assignee === null) delete customFields.assignee;
      else customFields.assignee = patch.assignee;
    }
    if (patch.label !== undefined) {
      if (patch.label === null) delete customFields.label;
      else customFields.label = patch.label;
    }
    task.customFields = customFields;
  }
  task.updatedAt = new Date();
}

async function findBulkTasksOrThrow(em: EntityManager, orgId: string, ids: string[]): Promise<Task[]> {
  const { In } = await import("typeorm");
  const tasks = await em.find(Task, { where: { org: { id: orgId }, id: In(ids), deletedAt: null } as never });
  if (tasks.length !== ids.length) {
    throw new AppNotFoundError("One or more tasks were not found.");
  }
  return tasks;
}

export function normalizedUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

async function findTaskOrNull(repo: TaskRepository, orgId: string, id: string): Promise<Task | null> {
  return repo.get({ orgId, id });
}

async function assertParentDoesNotCycle(input: {
  repo: TaskRepository;
  orgId: string;
  taskId: string;
  parentId: string | null;
}): Promise<void> {
  let cursor = input.parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === input.taskId || seen.has(cursor)) {
      throw new AppConflictError("Task parent cycle rejected.");
    }
    seen.add(cursor);
    const parent = await findTaskOrNull(input.repo, input.orgId, cursor);
    cursor = parent?.parent?.id ?? null;
  }
}

function assertDependencyGraphDoesNotCycle(edges: Map<string, Set<string>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) {
      throw new AppConflictError("Task dependency cycle rejected.");
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of edges.keys()) visit(id);
}

function replaceTaskDependencyEdges(input: {
  taskId: string;
  tasks: Task[];
  dependencies: TaskDependencies;
}): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const task of input.tasks) {
    edges.set(task.id, new Set(task.dependencies.blocks));
  }
  for (const [from] of edges) {
    if (from === input.taskId) {
      edges.set(from, new Set());
    }
  }
  edges.set(input.taskId, new Set(input.dependencies.blocks));
  for (const blockerId of input.dependencies.blocked_by) {
    const blocks = edges.get(blockerId) ?? new Set<string>();
    blocks.add(input.taskId);
    edges.set(blockerId, blocks);
  }
  return edges;
}

function dependenciesForTask(taskId: string, edges: Map<string, Set<string>>): TaskDependencies {
  const blocks = normalizedUnique([...(edges.get(taskId) ?? [])]);
  const blockedBy: string[] = [];
  for (const [from, to] of edges) {
    if (to.has(taskId)) blockedBy.push(from);
  }
  return { blocks, blocked_by: normalizedUnique(blockedBy) };
}

// HIGH-03: Inline field dependency validation.
async function validateFieldDependencies(
  em: EntityManager,
  orgId: string,
  projectId: string,
  task: Task,
): Promise<void> {
  const rules = await em.find(FieldDependencyRule, {
    org: orgId,
    projectId,
    action: "require",
  } as never);

  const missingFields: string[] = [];
  for (const rule of rules) {
    const sourceValue = task.customFields?.[rule.sourceFieldId];
    if (String(sourceValue) === rule.sourceValue) {
      const targetValue = task.customFields?.[rule.targetFieldId];
      if (targetValue === undefined || targetValue === null || targetValue === "") {
        missingFields.push(rule.targetFieldId);
      }
    }
  }

  if (missingFields.length > 0) {
    throw new AppValidationError(`Required fields missing due to dependency rules: ${missingFields.join(", ")}`);
  }
}

async function emitTaskEvent(ctx: {
  orgId: string;
  userId: string | null;
  em: EntityManager | null;
}, input: {
  verb: "parent_changed" | "dependency_updated" | "bulk_updated" | "bulk_deleted";
  taskId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!ctx.em) return;
  const event = ctx.em.create(Event, {
    org: { id: ctx.orgId } as Org,
    verb: input.verb,
    subjectKind: "task",
    subjectId: input.taskId,
    payload: input.payload,
    createdAt: new Date(),
  });
  await ctx.em.save(event);
}
