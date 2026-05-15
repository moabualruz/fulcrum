import { randomUUID } from "node:crypto";
import { DataSource, In } from "typeorm";

import {
  type WorkManagementSavedView,
  WorkManagementSavedViewEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FulcrumProjectEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface SavedViewPublicRow {
  id: string;
  orgId: string | null;
  projectId: string;
  name: string;
  scope: string;
  viewType: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  sortBy: string | null;
  displayProperties: Record<string, unknown>;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export class SavedViewPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId?: string;
    projectId?: string;
  }): Promise<SavedViewPublicRow[]> {
    const projectIds = await this.resolveProjectIds(input);
    if (projectIds.length === 0) return [];

    const views = await this.repository().find({
      where: {
        projectId: projectIds.length === 1 ? projectIds[0] : In(projectIds),
      },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return views.map((view) => toPublicRow(view, input.orgId ?? null, "project"));
  }

  async create(input: {
    orgId?: string;
    projectId?: string;
    name: string;
    scope?: string;
    viewType?: string;
  }): Promise<SavedViewPublicRow | null> {
    if (!input.projectId) return null;
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: input.projectId,
      ...(input.orgId ? { workspaceId: input.orgId } : {}),
    });
    if (!project) return null;

    const id = randomUUID();
    const saved = await this.repository().save({
      id,
      projectId: input.projectId,
      name: input.name,
      layout: input.viewType ?? "list",
      filters: { scope: input.scope ?? "private" },
      groupBy: null,
      sortBy: null,
      displayProperties: {},
      traceId: `trace-saved-view-${id}`,
    });
    return toPublicRow(saved, input.orgId ?? project.workspaceId, input.scope ?? "private");
  }

  async get(input: { id: string }): Promise<SavedViewPublicRow | null> {
    const view = await this.repository().findOneBy({ id: input.id });
    return view ? toPublicRow(view, null, "project") : null;
  }

  async update(input: {
    id: string;
    name?: string;
    scope?: string;
    viewType?: string;
  }): Promise<SavedViewPublicRow | null> {
    const view = await this.repository().findOneBy({ id: input.id });
    if (!view) return null;

    if (input.name !== undefined) view.name = input.name;
    if (input.scope !== undefined) view.filters = { ...view.filters, scope: input.scope };
    if (input.viewType !== undefined) view.layout = input.viewType;
    return toPublicRow(await this.repository().save(view), null, input.scope ?? "project");
  }

  async delete(input: { id: string }): Promise<SavedViewPublicRow | null> {
    const view = await this.repository().findOneBy({ id: input.id });
    if (!view) return null;

    await this.repository().remove(view);
    return toPublicRow(view, null, "project");
  }

  private async resolveProjectIds(input: { orgId?: string; projectId?: string }): Promise<string[]> {
    if (input.projectId) {
      const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
        id: input.projectId,
        ...(input.orgId ? { workspaceId: input.orgId } : {}),
      });
      return project ? [project.id] : [];
    }
    if (!input.orgId) return [];

    const projects = await this.dataSource.getRepository(FulcrumProjectEntity).findBy({ workspaceId: input.orgId });
    return projects.map((project) => project.id);
  }

  private repository() {
    return this.dataSource.getRepository(WorkManagementSavedViewEntity);
  }
}

function toPublicRow(view: WorkManagementSavedView, orgId: string | null, scope: string): SavedViewPublicRow {
  return {
    id: view.id,
    orgId,
    projectId: view.projectId,
    name: view.name,
    scope: typeof view.filters["scope"] === "string" ? view.filters["scope"] as string : scope,
    viewType: view.layout,
    filters: view.filters,
    groupBy: view.groupBy,
    sortBy: view.sortBy,
    displayProperties: view.displayProperties,
    traceId: view.traceId,
    createdAt: view.createdAt?.toISOString() ?? null,
    updatedAt: view.updatedAt?.toISOString() ?? null,
  };
}
