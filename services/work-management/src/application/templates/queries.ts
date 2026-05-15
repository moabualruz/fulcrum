import type { EntityManager } from "typeorm";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
  type DocTemplateRow,
  type DocTemplateService,
} from "@knowledge-workspace/application/docs/doc-template-service.ts";
import { EntityManagerDocTemplateService } from "@knowledge-workspace/application/docs/em-doc-template-service.ts";
import type { DocType } from "@platform-core/infrastructure/application-database/entities/docs/enums.ts";
import { AppInvariantError } from "@platform-core/domain/errors.ts";
import { WorkItemTemplateService } from "@work-management/application/work-item-templates.ts";
import type { AppContext, CreateTemplateInput, TemplateDto } from "@work-management/application/templates/types.ts";

/** Minimal DI container interface — fulfilled by needle-di Container at runtime. */
interface DiContainer {
  get<T>(token: unknown): T;
}

export async function listTemplates(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<TemplateDto[]> {
  return new WorkItemTemplateService(em).list(ctx.orgId, projectId);
}

export async function createTemplate(
  em: EntityManager,
  ctx: AppContext,
  input: CreateTemplateInput,
): Promise<TemplateDto> {
  return new WorkItemTemplateService(em).create(
    ctx.orgId,
    input.projectId ?? null,
    input.name,
    input.templateData,
    ctx.userId,
    input.description,
  );
}

export async function applyTemplate(
  em: EntityManager,
  ctx: AppContext,
  templateId: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return new WorkItemTemplateService(em).apply(ctx.orgId, templateId, overrides);
}

export async function deleteTemplate(em: EntityManager, ctx: AppContext, templateId: string): Promise<void> {
  await new WorkItemTemplateService(em).delete(ctx.orgId, templateId);
}

export async function setDefaultTemplate(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
  templateId: string,
): Promise<void> {
  await new WorkItemTemplateService(em).setDefault(ctx.orgId, projectId, templateId);
}

export async function listDocTemplates(
  em: EntityManager | null,
  container: DiContainer | null,
  ctx: Pick<AppContext, "orgId">,
  projectId?: string | null,
): Promise<DocTemplateRow[]> {
  return (await resolveDocTemplateService(em, container)).list(ctx.orgId, projectId);
}

export async function resolveDocTemplate(
  em: EntityManager | null,
  container: DiContainer | null,
  ctx: Pick<AppContext, "orgId">,
  projectId: string | null,
  docType: DocType,
): Promise<DocTemplateRow | null> {
  return (await resolveDocTemplateService(em, container)).resolve(ctx.orgId, projectId, docType);
}

async function resolveDocTemplateService(
  em: EntityManager | null,
  container: DiContainer | null,
): Promise<DocTemplateService> {
  if (container) {
    try {
      return container.get(DOC_TEMPLATE_SERVICE_TOKEN);
    } catch {
      // Fall through to request EntityManager backed service.
    }
  }
  if (em) return new EntityManagerDocTemplateService(em);
  throw new AppInvariantError("DocTemplateService is not available (no container token or EntityManager).");
}
