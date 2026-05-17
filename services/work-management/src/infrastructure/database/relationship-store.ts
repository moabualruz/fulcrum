import { randomUUID } from "node:crypto";

import type { DataSource } from "typeorm";

import { summarizeRelationships } from "@work-management/application/relationships/summary.ts";
import type { TraceRef } from "@workflow-coordination/domain/trace.ts";
import {
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  type FulcrumProject,
  type FulcrumTask,
  type FulcrumTaskDependency,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type RelationshipType = "blocks" | "relates_to" | "duplicate_of";

export interface RelationshipScope {
  orgId: string;
}

export interface RelationshipRow {
  id: string;
  orgId: string;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: RelationshipType;
  traceId: string;
  createdAt: string | null;
}

export class RelationshipStore {
  constructor(private readonly dataSource: DataSource) {}

  async createRelationship(input: RelationshipScope & {
    sourceTaskId: string;
    targetTaskId: string;
    type: RelationshipType;
  }): Promise<RelationshipRow | null> {
    if (input.sourceTaskId === input.targetTaskId) {
      throw new Error("Cannot create self-referential relationship.");
    }
    const [sourceTask, targetTask] = await Promise.all([
      this.findScopedTask(input.orgId, input.sourceTaskId),
      this.findScopedTask(input.orgId, input.targetTaskId),
    ]);
    if (!sourceTask || !targetTask || sourceTask.projectId !== targetTask.projectId) return null;

    const edge = edgeFromRelationship({
      projectId: sourceTask.projectId,
      sourceTaskId: sourceTask.id,
      targetTaskId: targetTask.id,
      type: input.type,
    });
    if (input.type === "blocks") {
      const existing = await this.dependencyRepository().find({
        where: { projectId: sourceTask.projectId, dependencyKind: "blocks" },
      });
      assertNoBlockCycle([...existing, edge]);
    }

    const saved = await this.dependencyRepository().save(edge);
    return toRelationshipRow(input.orgId, saved);
  }

  async deleteRelationship(input: RelationshipScope & { relationshipId: string }): Promise<{ ok: true; relationshipId: string } | null> {
    const edge = await this.findScopedEdge(input.orgId, input.relationshipId);
    if (!edge) return null;
    await this.dependencyRepository().delete({ id: edge.id });
    return { ok: true, relationshipId: edge.id };
  }

  async listRelationshipsForTask(input: RelationshipScope & { taskId: string }): Promise<RelationshipRow[]> {
    const task = await this.findScopedTask(input.orgId, input.taskId);
    if (!task) return [];
    const edges = await this.dependencyRepository()
      .createQueryBuilder("edge")
      .where("edge.project_id = :projectId", { projectId: task.projectId })
      .andWhere("(edge.task_id = :taskId OR edge.depends_on_task_id = :taskId)", { taskId: task.id })
      .orderBy("edge.created_at", "ASC")
      .addOrderBy("edge.id", "ASC")
      .getMany();
    return edges.map((edge) => toRelationshipRow(input.orgId, edge));
  }

  async listTaskBlockers(input: RelationshipScope & { taskId: string }): Promise<RelationshipRow[]> {
    const task = await this.findScopedTask(input.orgId, input.taskId);
    if (!task) return [];
    const edges = await this.dependencyRepository().find({
      where: { projectId: task.projectId, taskId: task.id, dependencyKind: "blocks" },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return edges.map((edge) => toRelationshipRow(input.orgId, edge));
  }

  async listTasksBlockedBy(input: RelationshipScope & { taskId: string }): Promise<RelationshipRow[]> {
    const task = await this.findScopedTask(input.orgId, input.taskId);
    if (!task) return [];
    const edges = await this.dependencyRepository().find({
      where: { projectId: task.projectId, dependsOnTaskId: task.id, dependencyKind: "blocks" },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return edges.map((edge) => toRelationshipRow(input.orgId, edge));
  }

  async listBlockedItems(input: RelationshipScope & { projectId: string }): Promise<RelationshipRow[]> {
    const project = await this.findScopedProject(input.orgId, input.projectId);
    if (!project) return [];
    const edges = await this.dependencyRepository().find({
      where: { projectId: project.id, dependencyKind: "blocks" },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return edges.map((edge) => toRelationshipRow(input.orgId, edge));
  }

  async markTaskAsDuplicate(input: RelationshipScope & {
    sourceTaskId: string;
    targetTaskId: string;
    autoClose?: boolean;
    transferWatchers?: boolean;
  }): Promise<RelationshipRow | null> {
    const relationship = await this.createRelationship({
      orgId: input.orgId,
      sourceTaskId: input.sourceTaskId,
      targetTaskId: input.targetTaskId,
      type: "duplicate_of",
    });
    if (!relationship) return null;
    if (input.autoClose) {
      const task = await this.findScopedTask(input.orgId, input.sourceTaskId);
      if (task) {
        task.status = "cancelled";
        await this.taskRepository().save(task);
      }
    }
    return relationship;
  }

  async summarizeEntityRelationships(input: RelationshipScope & {
    projectId: string;
    entity: TraceRef;
  }) {
    const project = await this.findScopedProject(input.orgId, input.projectId);
    if (!project) return null;
    const refs = await this.relationshipRefs(input);
    return summarizeRelationships({
      entity: input.entity,
      trace: {
        workspace: { kind: "workspace", id: input.orgId },
        project: { kind: "project", id: project.id, label: project.name },
        ...(input.entity.kind === "work_item" ? { workItem: input.entity } : {}),
      },
      refs,
    });
  }

  private async relationshipRefs(input: RelationshipScope & { projectId: string; entity: TraceRef }): Promise<TraceRef[]> {
    if (input.entity.kind !== "work_item") return [];
    return (await this.listRelationshipsForTask({ orgId: input.orgId, taskId: input.entity.id }))
      .map((relationship) => relationship.sourceTaskId === input.entity.id
        ? relationship.targetTaskId
        : relationship.sourceTaskId)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .map((id) => ({ kind: "work_item", id }) satisfies TraceRef);
  }

  private async findScopedProject(orgId: string, projectId: string): Promise<FulcrumProject | null> {
    return await this.projectRepository().findOneBy({ id: projectId, workspaceId: orgId });
  }

  private async findScopedTask(orgId: string, taskId: string): Promise<FulcrumTask | null> {
    const task = await this.taskRepository().findOneBy({ id: taskId });
    if (!task) return null;
    const project = await this.findScopedProject(orgId, task.projectId);
    return project ? task : null;
  }

  private async findScopedEdge(orgId: string, relationshipId: string): Promise<FulcrumTaskDependency | null> {
    const edge = await this.dependencyRepository().findOneBy({ id: relationshipId });
    if (!edge) return null;
    const project = await this.findScopedProject(orgId, edge.projectId);
    return project ? edge : null;
  }

  private projectRepository() {
    return this.dataSource.getRepository(FulcrumProjectEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }

  private dependencyRepository() {
    return this.dataSource.getRepository(FulcrumTaskDependencyEntity);
  }
}

function edgeFromRelationship(input: {
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: RelationshipType;
}): FulcrumTaskDependency {
  const [taskId, dependsOnTaskId] = input.type === "blocks"
    ? [input.targetTaskId, input.sourceTaskId]
    : [input.sourceTaskId, input.targetTaskId];
  return {
    id: randomUUID(),
    projectId: input.projectId,
    taskId,
    dependsOnTaskId,
    dependencyKind: input.type,
    traceId: `trace-relationship-${input.type}-${input.sourceTaskId}-${input.targetTaskId}`,
  };
}

function toRelationshipRow(orgId: string, edge: FulcrumTaskDependency): RelationshipRow {
  const type = normalizeRelationshipType(edge.dependencyKind);
  const [sourceTaskId, targetTaskId] = type === "blocks"
    ? [edge.dependsOnTaskId, edge.taskId]
    : [edge.taskId, edge.dependsOnTaskId];
  return {
    id: edge.id,
    orgId,
    projectId: edge.projectId,
    sourceTaskId,
    targetTaskId,
    type,
    traceId: edge.traceId,
    createdAt: edge.createdAt?.toISOString() ?? null,
  };
}

function normalizeRelationshipType(value: string): RelationshipType {
  if (value === "blocks" || value === "relates_to" || value === "duplicate_of") return value;
  return "blocks";
}

function assertNoBlockCycle(edges: FulcrumTaskDependency[]): void {
  const blockedBy = new Map<string, string[]>();
  for (const edge of edges.filter((candidate) => candidate.dependencyKind === "blocks")) {
    blockedBy.set(edge.taskId, [...(blockedBy.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) return false;
    if (visited.has(taskId)) return true;
    visiting.add(taskId);
    for (const dependencyId of blockedBy.get(taskId) ?? []) {
      if (!visit(dependencyId)) return false;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return true;
  };
  for (const taskId of blockedBy.keys()) {
    if (!visit(taskId)) throw new Error("Creating this blocks relationship would create a cycle.");
  }
}
