/**
 * WorkItemTemplateService.
 *
 * CRUD for task templates. Templates can be workspace-scoped (projectId=null)
 * or project-scoped. apply() returns pre-filled fields without creating a task.
 */

import type { EntityManager } from "typeorm";

import { TaskTemplate } from "@platform-core/infrastructure/application-database/entities/tasks/TaskTemplate.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";

// ── Output types ──────────────────────────────────────────────────────────────

export interface TemplateOutput {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  templateData: object | null;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class WorkItemTemplateService {
  constructor(private readonly em: EntityManager) {}

  private serialize(t: TaskTemplate): TemplateOutput {
    return {
      id: t.id,
      orgId: (t.org as Org).id,
      projectId: t.projectId,
      name: t.name,
      description: t.description,
      templateData: t.templateData,
      isDefault: t.isDefault,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async create(
    orgId: string,
    projectId: string | null,
    name: string,
    templateData: object,
    createdBy: string,
    description?: string,
  ): Promise<TemplateOutput> {
    const template = this.em.create(TaskTemplate, {
      org: this.em.getReference(Org, orgId),
      projectId: projectId ?? null,
      name,
      description: description ?? null,
      templateData,
      createdBy,
    } as never);

    this.em.persist(template);
    await this.em.flush();
    return this.serialize(template);
  }

  async list(orgId: string, projectId: string): Promise<TemplateOutput[]> {
    const templates = await this.em.find(TaskTemplate, {
      org: { id: orgId },
      $or: [
        { projectId },
        { projectId: null }, // workspace-scoped
      ],
    } as never);

    return templates.map((t) => this.serialize(t));
  }

  async apply(
    orgId: string,
    templateId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const template = await this.em.findOne(TaskTemplate, {
      id: templateId,
      org: { id: orgId },
    } as never);

    if (!template) {
      throw new AppNotFoundError(`Template ${templateId} not found`);
    }

    return {
      ...(template.templateData as Record<string, unknown> ?? {}),
      ...overrides,
    };
  }

  async delete(orgId: string, templateId: string): Promise<void> {
    const template = await this.em.findOne(TaskTemplate, {
      id: templateId,
      org: { id: orgId },
    } as never);

    if (!template) {
      throw new AppNotFoundError(`Template ${templateId} not found`);
    }

    this.em.remove(template);
    await this.em.flush();
  }

  async setDefault(
    orgId: string,
    projectId: string,
    templateId: string,
  ): Promise<void> {
    // Clear existing defaults for this scope
    const existing = await this.em.find(TaskTemplate, {
      org: { id: orgId },
      projectId,
      isDefault: true,
    } as never);

    for (const t of existing) {
      t.isDefault = false;
    }

    const template = await this.em.findOne(TaskTemplate, {
      id: templateId,
      org: { id: orgId },
    } as never);

    if (!template) {
      throw new AppNotFoundError(`Template ${templateId} not found`);
    }

    template.isDefault = true;
    await this.em.flush();
  }
}
