import type { EntityManager } from "@mikro-orm/postgresql";
import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import {
  DOC_TEMPLATE_SERVICE_TOKEN,
  type DocTemplateRow,
  type DocTemplateService,
} from "../../docs/doc-template-service.ts";
import { EntityManagerDocTemplateService } from "../../docs/em-doc-template-service.ts";
import type { DocType } from "../../db/entities/docs/enums.ts";
import { TemplateService } from "../../services/TemplateService.ts";
import type { AppContext, CreateTemplateInput, TemplateDto } from "./types.ts";

export async function listTemplates(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<TemplateDto[]> {
  return new TemplateService(em).list(ctx.orgId, projectId);
}

export async function createTemplate(
  em: EntityManager,
  ctx: AppContext,
  input: CreateTemplateInput,
): Promise<TemplateDto> {
  return new TemplateService(em).create(
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
  return new TemplateService(em).apply(ctx.orgId, templateId, overrides);
}

export async function deleteTemplate(em: EntityManager, ctx: AppContext, templateId: string): Promise<void> {
  await new TemplateService(em).delete(ctx.orgId, templateId);
}

export async function setDefaultTemplate(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
  templateId: string,
): Promise<void> {
  await new TemplateService(em).setDefault(ctx.orgId, projectId, templateId);
}

export async function listDocTemplates(
  em: EntityManager | null,
  container: Container | null,
  ctx: Pick<AppContext, "orgId">,
  projectId?: string | null,
): Promise<DocTemplateRow[]> {
  return (await resolveDocTemplateService(em, container)).list(ctx.orgId, projectId);
}

export async function resolveDocTemplate(
  em: EntityManager | null,
  container: Container | null,
  ctx: Pick<AppContext, "orgId">,
  projectId: string | null,
  docType: DocType,
): Promise<DocTemplateRow | null> {
  return (await resolveDocTemplateService(em, container)).resolve(ctx.orgId, projectId, docType);
}

async function resolveDocTemplateService(
  em: EntityManager | null,
  container: Container | null,
): Promise<DocTemplateService> {
  if (container) {
    try {
      return container.get(DOC_TEMPLATE_SERVICE_TOKEN);
    } catch {
      // Fall through to request EntityManager backed service.
    }
  }
  if (em) return new EntityManagerDocTemplateService(em);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "DocTemplateService is not available (no container token or EntityManager).",
  });
}
