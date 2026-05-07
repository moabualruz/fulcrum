import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";

import { Document } from "../../db/entities/docs/Document.ts";
import { DocService } from "../../services/DocService.ts";
import { serializeDoc } from "../../services/DocService.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type {
  AppContext,
  DocCommentDto,
  DocDto,
  DocVersionDto,
  DocVersionListDto,
  GetDocInput,
  ListDocsInput,
} from "./types.ts";

export async function listDocs(em: EntityManager, ctx: AppContext, input?: ListDocsInput): Promise<DocDto[]> {
  return new DocService(em).list(ctx.orgId, input);
}

export async function getDoc(em: EntityManager, ctx: AppContext, input: GetDocInput | string): Promise<DocDto | null> {
  const normalized = typeof input === "string" ? { id: input } : input;
  if (normalized.id) {
    const doc = await em.findOne(Document, { id: normalized.id } as never);
    if (!doc) throw new AppNotFoundError(`Document not found: ${normalized.id}`);
    if (doc.org.id !== ctx.orgId) throw new AppForbiddenError(`Document does not belong to org: ${ctx.orgId}`);
    if (doc.archived) throw new AppNotFoundError(`Document not found: ${normalized.id}`);
    return serializeDoc(doc);
  }
  try {
    return await new DocService(em).get(ctx.orgId, normalized);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      throw new AppNotFoundError("Document not found.", { cause: error });
    }
    throw error;
  }
}

export async function listDocComments(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  resolved?: boolean,
): Promise<DocCommentDto[]> {
  return new DocService(em).listComments(requiredUserContext(ctx), docId, resolved);
}

export async function listDocVersions(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<DocVersionListDto[]> {
  return new DocService(em).listVersions(requiredUserContext(ctx), docId);
}

export async function getDocVersion(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionNum: number,
): Promise<DocVersionDto | null> {
  return new DocService(em).getVersion(requiredUserContext(ctx), docId, versionNum);
}

export async function diffDocVersions(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  fromVersionNum: number,
  toVersionNum: number,
): Promise<{ html: string }> {
  return new DocService(em).diffVersions(requiredUserContext(ctx), docId, fromVersionNum, toVersionNum);
}

export async function listDocBacklinks(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<Array<{ fromDocId: string; title: string; slug: string; linkKind: "wikilink" }>> {
  return new DocService(em).listBacklinks(ctx.orgId, docId);
}

export async function listDocForwardLinks(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<Array<{ toDocId: string | null; toSlug: string; linkKind: "wikilink" }>> {
  return new DocService(em).listForwardLinks(ctx.orgId, docId);
}

function requiredUserContext(ctx: AppContext): { orgId: string; userId: string; em: EntityManager | null } {
  return { orgId: ctx.orgId, userId: uuidOrNull(ctx.userId ?? "") ?? "", em: null };
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}
