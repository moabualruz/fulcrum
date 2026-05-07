import type { EntityManager } from "@mikro-orm/postgresql";

import { DocService } from "../../services/DocService.ts";
import { AppValidationError } from "../errors.ts";
import type {
  AppContext,
  CreateDocCommentInput,
  DocCommentDto,
  DocDto,
  UpdateDocInput,
} from "./types.ts";
import type { CreateDocInput } from "./types.ts";

export async function createDoc(em: EntityManager, ctx: AppContext, input: CreateDocInput): Promise<DocDto> {
  if (!input.title?.trim()) throw new AppValidationError("Document title is required.");
  return new DocService(em).create(requiredUserContext(ctx), input);
}

export async function updateDoc(em: EntityManager, ctx: AppContext, input: UpdateDocInput): Promise<DocDto | null> {
  return new DocService(em).update(requiredUserContext(ctx), input);
}

export async function deleteDoc(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  hard = false,
): Promise<DocDto | { deleted: true } | null> {
  return new DocService(em).delete(requiredUserContext(ctx), id, hard);
}

export async function createDocComment(
  em: EntityManager,
  ctx: AppContext,
  input: CreateDocCommentInput,
): Promise<DocCommentDto> {
  return new DocService(em).createComment(requiredUserContext(ctx), input);
}

export async function updateDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  bodyMd: string,
): Promise<DocCommentDto | null> {
  return new DocService(em).updateComment(requiredUserContext(ctx), id, bodyMd);
}

export async function deleteDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<{ deleted: true } | null> {
  return new DocService(em).deleteComment(requiredUserContext(ctx), id);
}

export async function resolveDocComment(
  em: EntityManager,
  ctx: AppContext,
  id: string,
  resolved: boolean,
): Promise<DocCommentDto | null> {
  return new DocService(em).resolveComment(requiredUserContext(ctx), id, resolved);
}

export async function restoreDocVersion(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionNum: number,
): Promise<DocDto> {
  return new DocService(em).restoreVersion(requiredUserContext(ctx), docId, versionNum);
}

function requiredUserContext(ctx: AppContext): { orgId: string; userId: string; em: EntityManager | null } {
  if (!ctx.userId) throw new AppValidationError("Authenticated user is required.");
  return { orgId: ctx.orgId, userId: uuidOrNull(ctx.userId) ?? "", em: null };
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}
