import type { EntityManager } from "typeorm";

import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";
import { reconstructDocVersion } from "@knowledge-workspace/application/docs/version-reconstructor.ts";
import { DocumentService } from "@knowledge-workspace/application/document-service.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { getDocVersionById } from "@knowledge-workspace/application/docs/queries.ts";
import type {
  AppContext,
  CreateDocCommentInput,
  DocCommentDto,
  DocDto,
  UpdateDocInput,
} from "@knowledge-workspace/application/docs/types.ts";
import type { CreateDocInput } from "@knowledge-workspace/application/docs/types.ts";

export async function createDoc(em: EntityManager, ctx: AppContext, input: CreateDocInput): Promise<DocDto> {
  if (!input.title?.trim()) throw new AppValidationError("Document title is required.");
  return new DocumentService(em).create(requiredUserContext(ctx), input);
}

export async function updateDoc(em: EntityManager, ctx: AppContext, input: UpdateDocInput): Promise<DocDto | null> {
  return new DocumentService(em).update(requiredUserContext(ctx), input);
}

export async function deleteDoc(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  hard = false,
): Promise<DocDto | { deleted: true } | null> {
  return new DocumentService(em).delete(requiredUserContext(ctx), id, hard);
}

export async function createDocComment(
  em: EntityManager,
  ctx: AppContext,
  input: CreateDocCommentInput,
): Promise<DocCommentDto> {
  return new DocumentService(em).createComment(requiredUserContext(ctx), input);
}

export async function updateDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  bodyMd: string,
): Promise<DocCommentDto | null> {
  return new DocumentService(em).updateComment(requiredUserContext(ctx), id, bodyMd);
}

export async function deleteDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<{ deleted: true } | null> {
  return new DocumentService(em).deleteComment(requiredUserContext(ctx), id);
}

export async function resolveDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  resolved: boolean,
): Promise<DocCommentDto | null> {
  return new DocumentService(em).resolveComment(requiredUserContext(ctx), id, resolved);
}

export async function restoreDocVersion(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionNum: number,
): Promise<DocDto> {
  return new DocumentService(em).restoreVersion(requiredUserContext(ctx), docId, versionNum);
}

export async function restoreDocVersionById(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionId: string,
): Promise<{ id: string; versionNum: number; restoredFromVersionId: string }> {
  const target = await getDocVersionById(em, ctx, docId, versionId);
  if (!target) throw new AppNotFoundError("Version not found.");
  const reconstructed = await reconstructDocVersion(em, {
    orgId: ctx.orgId,
    docId,
    versionNum: target.versionNum,
  });
  const latest = await em.findOne(DocVersion, { where: {
    org: { id: ctx.orgId },
    doc: docId,
  } as never, order: { versionNum: "DESC" } });
  const nextVersionNum = (latest?.versionNum ?? 0) + 1;
  const newVersion = em.create(DocVersion, {
    org: { id: ctx.orgId },
    doc: docId,
    versionNum: nextVersionNum,
    snapshot: reconstructed.contentJson,
    bodyMdSnapshot: reconstructed.bodyMd,
    author: ctx.userId ?? null,
    restoreOf: versionId,
  } as never);
  await em.save(newVersion as never);
  return { id: newVersion.id, versionNum: nextVersionNum, restoredFromVersionId: versionId };
}

function requiredUserContext(ctx: AppContext): { orgId: string; userId: string; em: EntityManager | null } {
  if (!ctx.userId) throw new AppValidationError("Authenticated user is required.");
  return { orgId: ctx.orgId, userId: uuidOrNull(ctx.userId) ?? "", em: null };
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}
