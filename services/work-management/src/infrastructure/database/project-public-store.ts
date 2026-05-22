import { randomUUID } from "node:crypto";
import { IsNull } from "typeorm";
import type { DataSource } from "typeorm";

import {
  type FulcrumProject,
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export type ProjectPublicKind = "workspace" | "project" | "subproject";

export interface ProjectPublicRow {
  id: string;
  orgId: string;
  workspaceId: string;
  kind: ProjectPublicKind;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  ownerId: string | null;
  repoPath: string | null;
  template: string | null;
  memoryConfig: Record<string, unknown> | null;
  memory_config: Record<string, unknown> | null;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
  updated_at: string | null;
  taskCount: number;
  task_count: number;
  openTaskCount: number;
  open_task_count: number;
  docCount: number;
  doc_count: number;
  latestActivityAt: string | null;
  latest_activity_at: string | null;
}

export interface ProjectPublicStats {
  orgId: string;
  projectId: string;
  taskCount: number;
  doneTaskCount: number;
  openTaskCount: number;
  artifactCount: number;
  traceId: string;
}

export class ProjectPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listProjects(input: { orgId: string }): Promise<{ data: ProjectPublicRow[] }> {
    const projects = await this.projectRepository().find({
      where: { workspaceId: input.orgId },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return {
      data: await Promise.all(
        projects.map(async (project) => toPublicRow(input.orgId, project, {}, await this.projectListStats(project))),
      ),
    };
  }

  async createProject(input: {
    orgId: string;
    kind?: ProjectPublicKind;
    name: string;
    slug?: string;
    description?: string | null;
    status?: string;
    ownerId?: string | null;
    traceId?: string;
    repoPath?: string;
    template?: string;
  }): Promise<ProjectPublicRow> {
    const kind = input.kind ?? "project";
    if (kind === "workspace") {
      const workspace = await this.workspaceRepository().save({
        id: randomUUID(),
        slug: input.slug ?? slugify(input.name),
        name: input.name,
      });
      return {
        id: workspace.id,
        orgId: workspace.id,
        workspaceId: workspace.id,
        kind,
        slug: workspace.slug,
        name: workspace.name,
        description: input.description ?? null,
        status: input.status ?? "active",
        ownerId: input.ownerId ?? null,
        repoPath: input.repoPath ?? null,
        template: input.template ?? null,
        memoryConfig: null,
        memory_config: null,
        traceId: `trace-workspace-${workspace.id}`,
        createdAt: workspace.createdAt?.toISOString() ?? null,
        updatedAt: workspace.updatedAt?.toISOString() ?? null,
        updated_at: workspace.updatedAt?.toISOString() ?? null,
        taskCount: 0,
        task_count: 0,
        openTaskCount: 0,
        open_task_count: 0,
        docCount: 0,
        doc_count: 0,
        latestActivityAt: workspace.updatedAt?.toISOString() ?? null,
        latest_activity_at: workspace.updatedAt?.toISOString() ?? null,
      };
    }

    const id = randomUUID();
    const project = await this.projectRepository().save({
      id,
      workspaceId: input.orgId,
      slug: input.slug ?? slugify(input.name),
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      ownerId: input.ownerId ?? null,
      traceId: input.traceId ?? `trace-project-${id}`,
    });
    return toPublicRow(input.orgId, project, {
      kind,
      repoPath: input.repoPath ?? null,
      template: input.template ?? null,
    });
  }

  async getProject(input: { orgId: string; id: string }): Promise<ProjectPublicRow | null> {
    const project = await this.findScopedProject(input);
    return project ? toPublicRow(input.orgId, project) : null;
  }

  async patchProject(input: {
    orgId: string;
    id: string;
    name?: string;
    description?: string | null;
    status?: string;
    ownerId?: string | null;
    memoryConfig?: Record<string, unknown>;
  }): Promise<ProjectPublicRow | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;

    if (input.name !== undefined) project.name = input.name;
    if (input.description !== undefined) project.description = input.description;
    if (input.status !== undefined) project.status = input.status;
    if (input.ownerId !== undefined) project.ownerId = input.ownerId;
    if (input.memoryConfig !== undefined) {
      project.workflowConfig = {
        ...(project.workflowConfig ?? {}),
        memory_config: input.memoryConfig,
      };
    }
    return toPublicRow(input.orgId, await this.projectRepository().save(project));
  }

  async deleteProject(input: { orgId: string; id: string }): Promise<void> {
    const project = await this.findScopedProject(input);
    if (!project) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(FulcrumTaskDependencyEntity, { projectId: project.id });
      await manager.delete(FulcrumAgentRunEntity, { projectId: project.id });
      await manager.delete(FulcrumAcpSessionEntity, { projectId: project.id });
      await manager.delete(FulcrumDocumentEntity, { projectId: project.id });
      await manager.delete(FulcrumTaskEntity, { projectId: project.id });
      await manager.delete(FulcrumProjectEntity, { id: project.id, workspaceId: input.orgId });
    });
  }

  async projectStats(input: { orgId: string; id: string }): Promise<ProjectPublicStats | null> {
    const project = await this.findScopedProject(input);
    if (!project) return null;

    const tasks = await this.taskRepository().findBy({ projectId: project.id, deletedAt: IsNull() });
    const doneTaskCount = tasks.filter((task) => task.status === "done").length;
    const artifactCount = await this.countProjectArtifacts(project.id);
    return {
      orgId: input.orgId,
      projectId: project.id,
      taskCount: tasks.length,
      doneTaskCount,
      openTaskCount: tasks.length - doneTaskCount,
      artifactCount,
      traceId: project.traceId,
    };
  }

  private async findScopedProject(input: { orgId: string; id: string }): Promise<FulcrumProject | null> {
    return await this.projectRepository().findOneBy({ id: input.id, workspaceId: input.orgId });
  }

  private workspaceRepository() {
    return this.dataSource.getRepository(FulcrumWorkspaceEntity);
  }

  private projectRepository() {
    return this.dataSource.getRepository(FulcrumProjectEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }

  private documentRepository() {
    return this.dataSource.getRepository(FulcrumDocumentEntity);
  }

  private async projectListStats(project: FulcrumProject): Promise<ProjectPublicListStats> {
    const [tasks, docs] = await Promise.all([
      this.taskRepository().findBy({ projectId: project.id, deletedAt: IsNull() }),
      this.documentRepository().findBy({ projectId: project.id }),
    ]);
    const closed = new Set(["completed", "done", "canceled", "cancelled"]);
    const dates = [
      project.updatedAt,
      ...tasks.map((task) => task.updatedAt),
      ...docs.map((doc) => doc.updatedAt),
    ].filter((value): value is Date => value instanceof Date);
    const latest = dates.length > 0 ? new Date(Math.max(...dates.map((value) => value.getTime()))).toISOString() : null;
    return {
      taskCount: tasks.length,
      openTaskCount: tasks.filter((task) => !closed.has(task.status ?? "")).length,
      docCount: docs.length,
      latestActivityAt: latest,
    };
  }

  private async countProjectArtifacts(projectId: string): Promise<number> {
    const queryRunner = this.dataSource.createQueryRunner();
    const exists = await queryRunner.hasTable("fulcrum_artifacts");
    await queryRunner.release();
    if (!exists) return 0;
    const rows = await this.dataSource.query<Array<{ count: string }>>(
      "SELECT COUNT(*)::text AS count FROM fulcrum_artifacts WHERE project_id = $1 AND deleted_at IS NULL",
      [projectId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}

function toPublicRow(
  orgId: string,
  project: FulcrumProject,
  overrides: Partial<Pick<ProjectPublicRow, "kind" | "repoPath" | "template">> = {},
  stats: ProjectPublicListStats = EMPTY_PROJECT_LIST_STATS,
): ProjectPublicRow {
  const memoryConfig = project.workflowConfig?.["memory_config"];
  const publicMemoryConfig = isRecord(memoryConfig) ? memoryConfig : null;
  const updatedAt = project.updatedAt?.toISOString() ?? null;
  const latestActivityAt = stats.latestActivityAt ?? updatedAt;
  return {
    id: project.id,
    orgId,
    workspaceId: project.workspaceId,
    kind: overrides.kind ?? "project",
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
    status: project.status ?? "active",
    ownerId: project.ownerId ?? null,
    repoPath: overrides.repoPath ?? null,
    template: overrides.template ?? null,
    memoryConfig: publicMemoryConfig,
    memory_config: publicMemoryConfig,
    traceId: project.traceId,
    createdAt: project.createdAt?.toISOString() ?? null,
    updatedAt,
    updated_at: updatedAt,
    taskCount: stats.taskCount,
    task_count: stats.taskCount,
    openTaskCount: stats.openTaskCount,
    open_task_count: stats.openTaskCount,
    docCount: stats.docCount,
    doc_count: stats.docCount,
    latestActivityAt,
    latest_activity_at: latestActivityAt,
  };
}

interface ProjectPublicListStats {
  taskCount: number;
  openTaskCount: number;
  docCount: number;
  latestActivityAt: string | null;
}

const EMPTY_PROJECT_LIST_STATS: ProjectPublicListStats = {
  taskCount: 0,
  openTaskCount: 0,
  docCount: 0,
  latestActivityAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `project-${randomUUID()}`;
}
