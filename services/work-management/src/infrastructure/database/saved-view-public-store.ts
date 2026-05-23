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
  isDefault: boolean;
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
    filters?: Record<string, unknown>;
    sortBy?: string | null;
    isDefault?: boolean;
  }): Promise<SavedViewPublicRow | null> {
    if (!input.projectId) return null;
    // Accept slug or UUID; the row uses the canonical UUID downstream.
    const repo = this.dataSource.getRepository(FulcrumProjectEntity);
    const baseScope = input.orgId ? { workspaceId: input.orgId } : {};
    const project =
      (await repo.findOneBy({ id: input.projectId, ...baseScope })) ??
      (await repo.findOneBy({ slug: input.projectId, ...baseScope }));
    if (!project) return null;

    if (input.isDefault) await this.clearDefault(project.id);

    const id = randomUUID();
    const saved = await this.repository().save({
      id,
      projectId: project.id,
      name: input.name,
      layout: input.viewType ?? "list",
      filters: objectValue(input.filters),
      groupBy: null,
      sortBy: input.sortBy ?? null,
      displayProperties: {
        scope: input.scope ?? "private",
        isDefault: input.isDefault === true,
      },
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
    filters?: Record<string, unknown>;
    sortBy?: string | null;
    isDefault?: boolean;
  }): Promise<SavedViewPublicRow | null> {
    const view = await this.repository().findOneBy({ id: input.id });
    if (!view) return null;

    if (input.isDefault) await this.clearDefault(view.projectId, view.id);

    if (input.name !== undefined) view.name = input.name;
    if (input.filters !== undefined) view.filters = objectValue(input.filters);
    if (input.viewType !== undefined) view.layout = input.viewType;
    if (input.sortBy !== undefined) view.sortBy = input.sortBy;
    if (input.scope !== undefined || input.isDefault !== undefined) {
      view.displayProperties = {
        ...objectValue(view.displayProperties),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      };
    }
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
      // Accept either canonical UUID or slug — web routes pass slug, CLI passes UUID.
      const repo = this.dataSource.getRepository(FulcrumProjectEntity);
      const baseScope = input.orgId ? { workspaceId: input.orgId } : {};
      const byId = await repo.findOneBy({ id: input.projectId, ...baseScope });
      if (byId) return [byId.id];
      const bySlug = await repo.findOneBy({ slug: input.projectId, ...baseScope });
      return bySlug ? [bySlug.id] : [];
    }
    if (!input.orgId) return [];

    const projects = await this.dataSource.getRepository(FulcrumProjectEntity).findBy({ workspaceId: input.orgId });
    return projects.map((project) => project.id);
  }

  private repository() {
    return this.dataSource.getRepository(WorkManagementSavedViewEntity);
  }

  private async clearDefault(projectId: string, exceptId?: string): Promise<void> {
    const views = await this.repository().findBy({ projectId });
    for (const view of views) {
      if (view.id === exceptId) continue;
      const displayProperties = objectValue(view.displayProperties);
      if (displayProperties["isDefault"] !== true) continue;
      view.displayProperties = { ...displayProperties, isDefault: false };
    }
    await this.repository().save(views);
  }
}

function toPublicRow(view: WorkManagementSavedView, orgId: string | null, scope: string): SavedViewPublicRow {
  const displayProperties = objectValue(view.displayProperties);
  return {
    id: view.id,
    orgId,
    projectId: view.projectId,
    name: view.name,
    scope: typeof displayProperties["scope"] === "string" ? displayProperties["scope"] as string : scope,
    viewType: view.layout,
    filters: objectValue(view.filters),
    groupBy: view.groupBy,
    sortBy: view.sortBy,
    isDefault: displayProperties["isDefault"] === true,
    displayProperties,
    traceId: view.traceId,
    createdAt: view.createdAt?.toISOString() ?? null,
    updatedAt: view.updatedAt?.toISOString() ?? null,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
