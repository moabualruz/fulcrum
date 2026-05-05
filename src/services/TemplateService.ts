/**
 * TemplateService — Phase 05 Plan 04 (D-115).
 *
 * CRUD for task templates. Templates can be workspace-scoped (projectId=null)
 * or project-scoped. apply() returns pre-filled fields without creating a task.
 */

import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import { TaskTemplate } from "../db/entities/tasks/TaskTemplate.ts";
import { Org } from "../db/entities/auth/Org.ts";

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

export class TemplateService {
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
      org: { id: orgId },
      projectId: projectId ?? null,
      name,
      description: description ?? null,
      templateData,
      createdBy,
    } as never);

    await this.em.persistAndFlush(template);
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
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Template ${templateId} not found`,
      });
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
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Template ${templateId} not found`,
      });
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
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Template ${templateId} not found`,
      });
    }

    template.isDefault = true;
    await this.em.flush();
  }
}
