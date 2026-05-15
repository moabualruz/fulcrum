import type { EntityManager } from "@mikro-orm/postgresql";

import { DocVersion } from "@platform-core/infrastructure/application-database/entities/docs/DocVersion.ts";
import { Document } from "@platform-core/infrastructure/application-database/entities/docs/Document.ts";
import { diffDocVersionsHtml, reconstructDocVersion } from "@knowledge-workspace/application/docs/version-reconstructor.ts";
import { DocumentService, serializeDoc } from "@knowledge-workspace/application/document-service.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type {
  AppContext,
  DocCommentDto,
  DocDto,
  DocVersionDto,
  DocVersionListDto,
  GetDocInput,
  ListDocsInput,
} from "@knowledge-workspace/application/docs/types.ts";

export async function listDocs(em: EntityManager, ctx: AppContext, input?: ListDocsInput): Promise<DocDto[]> {
  return new DocumentService(em).list(ctx.orgId, input);
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
  return await new DocumentService(em).get(ctx.orgId, normalized);
}

export async function listDocComments(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  resolved?: boolean,
): Promise<DocCommentDto[]> {
  return new DocumentService(em).listComments(requiredUserContext(ctx), docId, resolved);
}

export async function listDocVersions(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<DocVersionListDto[]> {
  await assertDocBelongsToOrg(em, ctx, docId);
  const versions = await em.find(DocVersion, {
    org: ctx.orgId,
    doc: docId,
  } as never, {
    populate: ["author", "restoreOf"] as never,
    orderBy: { versionNum: "DESC" },
  });
  return versions.map(serializeVersionForApplication);
}

export async function getDocVersion(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionNum: number,
): Promise<DocVersionDto | null> {
  return new DocumentService(em).getVersion(requiredUserContext(ctx), docId, versionNum);
}

export async function getDocVersionById(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionId: string,
): Promise<DocVersionListDto | null> {
  const version = await em.findOne(DocVersion, {
    id: versionId,
    org: ctx.orgId,
    doc: docId,
  } as never, {
    populate: ["author", "restoreOf"] as never,
  });
  return version ? serializeVersionForApplication(version) : null;
}

export async function diffDocVersions(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  fromVersionNum: number,
  toVersionNum: number,
): Promise<{ html: string }> {
  return new DocumentService(em).diffVersions(requiredUserContext(ctx), docId, fromVersionNum, toVersionNum);
}

export async function diffDocVersionById(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
  versionId: string,
): Promise<{ html: string; hasDiff: boolean }> {
  const version = await getDocVersionById(em, ctx, docId, versionId);
  if (!version) throw new AppNotFoundError("Version not found.");
  if (version.versionNum <= 1) return { html: "", hasDiff: false };
  const [current, previous] = await Promise.all([
    reconstructDocVersion(em, { orgId: ctx.orgId, docId, versionNum: version.versionNum }),
    reconstructDocVersion(em, { orgId: ctx.orgId, docId, versionNum: version.versionNum - 1 }),
  ]);
  return { html: diffDocVersionsHtml(previous.contentJson, current.contentJson), hasDiff: true };
}

export async function listDocBacklinks(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<Array<{ fromDocId: string; title: string; slug: string; linkKind: "wikilink" }>> {
  return new DocumentService(em).listBacklinks(ctx.orgId, docId);
}

export async function listDocForwardLinks(
  em: EntityManager,
  ctx: AppContext,
  docId: string,
): Promise<Array<{ toDocId: string | null; toSlug: string; linkKind: "wikilink" }>> {
  return new DocumentService(em).listForwardLinks(ctx.orgId, docId);
}

function requiredUserContext(ctx: AppContext): { orgId: string; userId: string; em: EntityManager | null } {
  return { orgId: ctx.orgId, userId: uuidOrNull(ctx.userId ?? "") ?? "", em: null };
}

async function assertDocBelongsToOrg(em: EntityManager, ctx: AppContext, docId: string): Promise<void> {
  const doc = await em.findOne(Document, {
    id: docId,
    org: ctx.orgId,
    archived: false,
  } as never);
  if (!doc) throw new AppNotFoundError(`Document not found: ${docId}`);
}

function serializeVersionForApplication(version: DocVersion): DocVersionListDto {
  return {
    id: version.id,
    versionNum: version.versionNum,
    isSnapshot: version.snapshot !== null,
    authorId: version.author?.id ?? null,
    authorName: version.author?.name ?? version.author?.email ?? null,
    createdAt: version.createdAt,
    isRestoreOf: version.restoreOf?.id ?? null,
  } as DocVersionListDto & { authorName: string | null; isRestoreOf: string | null };
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}
