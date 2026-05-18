import { randomUUID } from "node:crypto";
import { DataSource, In, IsNull } from "typeorm";

import {
  type WorkManagementIntake,
  WorkManagementIntakeEntity,
  type WorkManagementLabel,
  WorkManagementLabelEntity,
  WorkManagementModuleEntity,
  type WorkManagementModule,
  WorkManagementModuleTaskEntity,
  WorkManagementTaskLabelEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FulcrumProjectEntity, FulcrumTaskEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type PlanningModuleStatus = "planned" | "active" | "completed" | "archived";
export type PlanningIntakeStatus = "open" | "accepted" | "declined" | "converted";

interface PlanningScope {
  orgId: string;
  projectId: string;
}

export interface PlanningModulePublicRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  status: string;
  leadUserId: string | null;
  taskCount: number;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlanningLabelPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  color: string;
  taskCount: number;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlanningIntakePublicRow {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  source: string;
  taskId: string | null;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlanningTaskAssignmentPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  taskId: string;
  targetId: string;
  targetType: "module" | "label";
  traceId: string;
  createdAt: string | null;
}

export class PlanningStructurePublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: PlanningScope): Promise<{
    modules: PlanningModulePublicRow[];
    labels: PlanningLabelPublicRow[];
    intakeRequests: PlanningIntakePublicRow[];
  }> {
    const project = await this.resolveProject(input);
    if (!project) return { modules: [], labels: [], intakeRequests: [] };

    const modules = await this.moduleRepository().find({
      where: { projectId: input.projectId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const labels = await this.labelRepository().find({
      where: { projectId: input.projectId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const intakes = await this.intakeRepository().find({
      where: { projectId: input.projectId },
      order: { createdAt: "DESC", id: "ASC" },
    });
    const moduleCounts = await this.moduleTaskCounts(input.projectId);
    const labelCounts = await this.labelTaskCounts(input.projectId);

    return {
      modules: modules.map((module) => toModuleRow(input.orgId, module, moduleCounts.get(module.id) ?? 0)),
      labels: labels.map((label) => toLabelRow(input.orgId, label, labelCounts.get(label.id) ?? 0)),
      intakeRequests: intakes.map((intake) => toIntakeRow(input.orgId, intake)),
    };
  }

  async createModule(input: PlanningScope & {
    name: string;
    status?: PlanningModuleStatus;
    leadUserId?: string | null;
  }): Promise<PlanningModulePublicRow | null> {
    const project = await this.resolveProject(input);
    if (!project) return null;
    const id = randomUUID();
    const module = await this.moduleRepository().save({
      id,
      projectId: input.projectId,
      name: input.name,
      status: input.status ?? "planned",
      leadUserId: input.leadUserId ?? null,
      traceId: `trace-module-${id}`,
    });
    return toModuleRow(input.orgId, module, 0);
  }

  async updateModule(input: PlanningScope & {
    id: string;
    name?: string;
    status?: PlanningModuleStatus;
    leadUserId?: string | null;
  }): Promise<PlanningModulePublicRow | null> {
    const module = await this.findModule(input);
    if (!module) return null;
    if (input.name !== undefined) module.name = input.name;
    if (input.status !== undefined) module.status = input.status;
    if (input.leadUserId !== undefined) module.leadUserId = input.leadUserId;
    const saved = await this.moduleRepository().save(module);
    return toModuleRow(input.orgId, saved, await this.moduleTaskCount(saved.id));
  }

  async deleteModule(input: PlanningScope & { id: string }): Promise<PlanningModulePublicRow | null> {
    const module = await this.findModule(input);
    if (!module) return null;
    const row = toModuleRow(input.orgId, module, await this.moduleTaskCount(module.id));
    await this.moduleRepository().remove(module);
    return row;
  }

  async addModuleTask(input: PlanningScope & { id: string; taskId: string }): Promise<PlanningTaskAssignmentPublicRow | null> {
    const module = await this.findModule(input);
    if (!module || !(await this.taskExists(input))) return null;
    const existing = await this.moduleTaskRepository().findOneBy({ moduleId: module.id, taskId: input.taskId });
    if (existing) return toAssignmentRow(input.orgId, existing, "module");
    const id = randomUUID();
    const row = await this.moduleTaskRepository().save({
      id,
      projectId: input.projectId,
      moduleId: module.id,
      taskId: input.taskId,
      traceId: `trace-module-task-${module.id}-${input.taskId}`,
    });
    return toAssignmentRow(input.orgId, row, "module");
  }

  async removeModuleTask(input: PlanningScope & { id: string; taskId: string }): Promise<PlanningTaskAssignmentPublicRow | null> {
    const row = await this.moduleTaskRepository().findOneBy({
      projectId: input.projectId,
      moduleId: input.id,
      taskId: input.taskId,
    });
    if (!row) return null;
    await this.moduleTaskRepository().remove(row);
    return toAssignmentRow(input.orgId, row, "module");
  }

  async createLabel(input: PlanningScope & { name: string; color?: string }): Promise<PlanningLabelPublicRow | null> {
    const project = await this.resolveProject(input);
    if (!project) return null;
    const id = randomUUID();
    const label = await this.labelRepository().save({
      id,
      projectId: input.projectId,
      name: input.name,
      color: input.color ?? "#64748b",
      traceId: `trace-label-${id}`,
    });
    return toLabelRow(input.orgId, label, 0);
  }

  async updateLabel(input: PlanningScope & { id: string; name?: string; color?: string }): Promise<PlanningLabelPublicRow | null> {
    const label = await this.findLabel(input);
    if (!label) return null;
    if (input.name !== undefined) label.name = input.name;
    if (input.color !== undefined) label.color = input.color;
    const saved = await this.labelRepository().save(label);
    return toLabelRow(input.orgId, saved, await this.labelTaskCount(saved.id));
  }

  async deleteLabel(input: PlanningScope & { id: string }): Promise<PlanningLabelPublicRow | null> {
    const label = await this.findLabel(input);
    if (!label) return null;
    const row = toLabelRow(input.orgId, label, await this.labelTaskCount(label.id));
    await this.labelRepository().remove(label);
    return row;
  }

  async addLabelTask(input: PlanningScope & { id: string; taskId: string }): Promise<PlanningTaskAssignmentPublicRow | null> {
    const label = await this.findLabel(input);
    if (!label || !(await this.taskExists(input))) return null;
    const existing = await this.taskLabelRepository().findOneBy({ labelId: label.id, taskId: input.taskId });
    if (existing) return toAssignmentRow(input.orgId, existing, "label");
    const id = randomUUID();
    const row = await this.taskLabelRepository().save({
      id,
      projectId: input.projectId,
      labelId: label.id,
      taskId: input.taskId,
      traceId: `trace-label-task-${label.id}-${input.taskId}`,
    });
    return toAssignmentRow(input.orgId, row, "label");
  }

  async removeLabelTask(input: PlanningScope & { id: string; taskId: string }): Promise<PlanningTaskAssignmentPublicRow | null> {
    const row = await this.taskLabelRepository().findOneBy({
      projectId: input.projectId,
      labelId: input.id,
      taskId: input.taskId,
    });
    if (!row) return null;
    await this.taskLabelRepository().remove(row);
    return toAssignmentRow(input.orgId, row, "label");
  }

  async createIntake(input: PlanningScope & {
    title: string;
    description?: string | null;
    source?: string;
    taskId?: string | null;
  }): Promise<PlanningIntakePublicRow | null> {
    const project = await this.resolveProject(input);
    if (!project) return null;
    const id = randomUUID();
    const intake = await this.intakeRepository().save({
      id,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      status: "open",
      source: input.source ?? "manual",
      taskId: input.taskId ?? null,
      traceId: `trace-intake-${id}`,
    });
    return toIntakeRow(input.orgId, intake);
  }

  async updateIntake(input: PlanningScope & {
    id: string;
    title?: string;
    description?: string | null;
    status?: PlanningIntakeStatus;
    source?: string;
    taskId?: string | null;
  }): Promise<PlanningIntakePublicRow | null> {
    const intake = await this.findIntake(input);
    if (!intake) return null;
    if (input.title !== undefined) intake.title = input.title;
    if (input.description !== undefined) intake.description = input.description;
    if (input.status !== undefined) intake.status = input.status;
    if (input.source !== undefined) intake.source = input.source;
    if (input.taskId !== undefined) intake.taskId = input.taskId;
    return toIntakeRow(input.orgId, await this.intakeRepository().save(intake));
  }

  async deleteIntake(input: PlanningScope & { id: string }): Promise<PlanningIntakePublicRow | null> {
    const intake = await this.findIntake(input);
    if (!intake) return null;
    const row = toIntakeRow(input.orgId, intake);
    await this.intakeRepository().remove(intake);
    return row;
  }

  private async resolveProject(input: PlanningScope) {
    return await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: input.projectId,
      workspaceId: input.orgId,
    });
  }

  private async taskExists(input: PlanningScope & { taskId: string }): Promise<boolean> {
    return await this.dataSource.getRepository(FulcrumTaskEntity).existsBy({
      id: input.taskId,
      projectId: input.projectId,
      deletedAt: IsNull(),
    });
  }

  private async findModule(input: PlanningScope & { id: string }) {
    return await this.moduleRepository().findOneBy({ id: input.id, projectId: input.projectId });
  }

  private async findLabel(input: PlanningScope & { id: string }) {
    return await this.labelRepository().findOneBy({ id: input.id, projectId: input.projectId });
  }

  private async findIntake(input: PlanningScope & { id: string }) {
    return await this.intakeRepository().findOneBy({ id: input.id, projectId: input.projectId });
  }

  private moduleRepository() {
    return this.dataSource.getRepository(WorkManagementModuleEntity);
  }

  private moduleTaskRepository() {
    return this.dataSource.getRepository(WorkManagementModuleTaskEntity);
  }

  private labelRepository() {
    return this.dataSource.getRepository(WorkManagementLabelEntity);
  }

  private taskLabelRepository() {
    return this.dataSource.getRepository(WorkManagementTaskLabelEntity);
  }

  private intakeRepository() {
    return this.dataSource.getRepository(WorkManagementIntakeEntity);
  }

  private async moduleTaskCounts(projectId: string): Promise<Map<string, number>> {
    const modules = await this.moduleRepository().find({ where: { projectId }, select: { id: true } });
    if (modules.length === 0) return new Map();
    const rows = await this.moduleTaskRepository().find({ where: { moduleId: In(modules.map((module) => module.id)) } });
    return countBy(rows.map((row) => row.moduleId));
  }

  private async labelTaskCounts(projectId: string): Promise<Map<string, number>> {
    const labels = await this.labelRepository().find({ where: { projectId }, select: { id: true } });
    if (labels.length === 0) return new Map();
    const rows = await this.taskLabelRepository().find({ where: { labelId: In(labels.map((label) => label.id)) } });
    return countBy(rows.map((row) => row.labelId));
  }

  private async moduleTaskCount(moduleId: string): Promise<number> {
    return await this.moduleTaskRepository().countBy({ moduleId });
  }

  private async labelTaskCount(labelId: string): Promise<number> {
    return await this.taskLabelRepository().countBy({ labelId });
  }
}

function toModuleRow(orgId: string, module: WorkManagementModule, taskCount: number): PlanningModulePublicRow {
  return {
    id: module.id,
    orgId,
    projectId: module.projectId,
    name: module.name,
    status: module.status,
    leadUserId: module.leadUserId,
    taskCount,
    traceId: module.traceId,
    createdAt: module.createdAt?.toISOString() ?? null,
    updatedAt: module.updatedAt?.toISOString() ?? null,
  };
}

function toLabelRow(orgId: string, label: WorkManagementLabel, taskCount: number): PlanningLabelPublicRow {
  return {
    id: label.id,
    orgId,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
    taskCount,
    traceId: label.traceId,
    createdAt: label.createdAt?.toISOString() ?? null,
    updatedAt: label.updatedAt?.toISOString() ?? null,
  };
}

function toIntakeRow(orgId: string, intake: WorkManagementIntake): PlanningIntakePublicRow {
  return {
    id: intake.id,
    orgId,
    projectId: intake.projectId,
    title: intake.title,
    description: intake.description,
    status: intake.status,
    source: intake.source,
    taskId: intake.taskId,
    traceId: intake.traceId,
    createdAt: intake.createdAt?.toISOString() ?? null,
    updatedAt: intake.updatedAt?.toISOString() ?? null,
  };
}

function toAssignmentRow(
  orgId: string,
  row: {
    id: string;
    projectId: string;
    taskId: string;
    moduleId?: string;
    labelId?: string;
    traceId: string;
    createdAt?: Date;
  },
  targetType: "module" | "label",
): PlanningTaskAssignmentPublicRow {
  return {
    id: row.id,
    orgId,
    projectId: row.projectId,
    taskId: row.taskId,
    targetId: targetType === "module" ? row.moduleId ?? "" : row.labelId ?? "",
    targetType,
    traceId: row.traceId,
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}

function countBy(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
