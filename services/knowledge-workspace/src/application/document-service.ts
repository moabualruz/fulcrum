import { randomBytes, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import { DocComment } from "@platform-core/infrastructure/application-database/entities/docs/DocComment.ts";
import { DocLink } from "@platform-core/infrastructure/application-database/entities/docs/DocLink.ts";
import { Document } from "@platform-core/infrastructure/application-database/entities/docs/Document.ts";
import { DocVersion } from "@platform-core/infrastructure/application-database/entities/docs/DocVersion.ts";
import type { DocType, LinkKind, Scope } from "@platform-core/infrastructure/application-database/entities/docs/enums.ts";
import { archiveDocIndex, indexDoc, removeDocIndex } from "@knowledge-workspace/application/docs/search-indexer.ts";
import { applyNarrationToDoc } from "@knowledge-workspace/application/docs/llm-narrator.ts";
import { diffDocVersionsHtml, reconstructDocVersion } from "@knowledge-workspace/application/docs/version-reconstructor.ts";
import { writeDocVersion } from "@knowledge-workspace/application/docs/version-writer.ts";
import { syncDocWikilinks } from "@knowledge-workspace/application/docs/wikilink-extractor.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface DocOutput {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  parentId: string | null;
  projectId: string | null;
  scope: Scope;
  docType: DocType;
  frontmatter: Record<string, unknown>;
  bodyMd: string;
  contentJson: Record<string, unknown>;
  sortPosition: number;
  archived: boolean;
  externalId: string | null;
  updatedAt: Date;
}

export interface CommentReplyOutput {
  id: string;
  orgId: string;
  docId: string;
  anchorRange: Record<string, unknown> | null;
  authorId: string | null;
  bodyMd: string;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  replies: never[];
}

export interface CommentOutput {
  id: string;
  orgId: string;
  docId: string;
  anchorRange: Record<string, unknown> | null;
  authorId: string | null;
  bodyMd: string;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  replies: CommentReplyOutput[];
}

export interface VersionOutput {
  id: string;
  versionNum: number;
  isSnapshot: boolean;
  authorId: string | null;
  createdAt: Date;
  bodyMdSnapshot: string | null;
  restoreOfId: string | null;
}

interface DocContext {
  orgId: string;
  userId: string;
  em: EntityManager | null;
}

// ── Service ────────────────────────────────────────────────────────

export class DocumentService {
  constructor(private readonly em: EntityManager) {}

  // ── Document CRUD ──────────────────────────────────────────────

  async list(orgId: string, input?: {
    scope?: Scope;
    docType?: DocType;
    archived?: boolean;
    parentId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<DocOutput[]> {
    const docs = await this.em.find(
      Document,
      {
        org: orgId,
        archived: input?.archived ?? false,
        ...(input?.scope ? { scope: input.scope } : {}),
        ...(input?.docType ? { docType: input.docType } : {}),
        ...(input && "parentId" in input ? { parent: input.parentId } : {}),
      } as never,
      {
        orderBy: { sortPosition: "ASC", updatedAt: "DESC", id: "ASC" },
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      },
    );
    return docs.map(serializeDoc);
  }

  async get(orgId: string, input: { id?: string; slug?: string }): Promise<DocOutput | null> {
    const doc = await findDocByInput(this.em, orgId, input);
    if (!doc) {
      throw new AppNotFoundError("Document not found.");
    }
    return serializeDoc(doc);
  }

  async create(ctx: DocContext, input: {
    title: string;
    parentId?: string | null;
    projectId?: string | null;
    scope?: Scope;
    docType?: DocType;
    frontmatter?: Record<string, unknown>;
    bodyMd?: string;
    contentJson?: Record<string, unknown>;
    sortPosition?: number;
    source?: { kind: string; id: string };
    links?: Array<{
      kind?: string;
      id?: string;
      targetKind?: string;
      targetId?: string;
      linkKind?: LinkKind;
    }>;
  }): Promise<DocOutput> {
    const bodyMd = input.bodyMd ?? "";
    const parent = await resolveParent(this.em, ctx.orgId, input.parentId);
    const frontmatter = { ...(input.frontmatter ?? {}), title: input.title };
    const doc = this.em.create(Document, {
      id: randomUUID(),
      org: this.em.getReference(Org, ctx.orgId),
      parent,
      projectId: input.projectId ?? null,
      scope: input.scope ?? "project",
      docType: input.docType ?? "note",
      frontmatter,
      bodyMd,
      contentJson: input.contentJson ?? markdownToTipTap(bodyMd),
      sortPosition: input.sortPosition ?? 0,
      archived: false,
      externalId: await uniqueSlug(this.em, ctx.orgId, input.title),
      updatedAt: new Date(),
    });
    this.em.persist(doc);
    await writeDocVersion(this.em, { orgId: ctx.orgId, doc, authorId: ctx.userId });
    await upsertSearchDocument(this.em, ctx.orgId, doc.id, ctx.userId);
    persistExplicitDocLinks(this.em, ctx.orgId, doc, input.links);
    await this.em.flush();
    return serializeDoc(doc);
  }

  async update(ctx: DocContext, input: {
    id: string;
    title?: string;
    parentId?: string | null;
    projectId?: string | null;
    scope?: Scope;
    docType?: DocType;
    frontmatter?: Record<string, unknown>;
    bodyMd?: string;
    contentJson?: Record<string, unknown>;
    sortPosition?: number;
    archived?: boolean;
  }): Promise<DocOutput | null> {
    const doc = await this.em.findOne(Document, { org: ctx.orgId, id: input.id, archived: false } as never);
    if (!doc) return null;

    if (input.parentId !== undefined) doc.parent = await resolveParent(this.em, ctx.orgId, input.parentId);
    if (input.projectId !== undefined) doc.projectId = input.projectId;
    if (input.scope !== undefined) doc.scope = input.scope;
    if (input.docType !== undefined) doc.docType = input.docType;
    if (input.frontmatter !== undefined) doc.frontmatter = input.frontmatter;
    if (input.title !== undefined) doc.frontmatter = { ...doc.frontmatter, title: input.title };
    if (input.bodyMd !== undefined) {
      doc.bodyMd = input.bodyMd;
      if (input.contentJson === undefined) doc.contentJson = markdownToTipTap(input.bodyMd);
    }
    if (input.contentJson !== undefined) doc.contentJson = input.contentJson;
    if (input.sortPosition !== undefined) doc.sortPosition = input.sortPosition;
    if (input.archived !== undefined) doc.archived = input.archived;
    if (input.bodyMd !== undefined || input.contentJson !== undefined || input.docType !== undefined) {
      const narrated = await applyNarrationToDoc({
        docType: doc.docType,
        bodyMd: doc.bodyMd,
        contentJson: doc.contentJson,
      });
      if (narrated.changed) {
        doc.bodyMd = narrated.bodyMd;
        doc.contentJson = narrated.contentJson;
      }
    }
    doc.updatedAt = new Date();

    this.em.persist(doc);
    await syncDocWikilinks(this.em, ctx.orgId, doc, doc.contentJson);
    await writeDocVersion(this.em, { orgId: ctx.orgId, doc, authorId: ctx.userId });
    await upsertSearchDocument(this.em, ctx.orgId, doc.id, ctx.userId);
    await this.em.flush();
    return serializeDoc(doc);
  }

  async delete(ctx: DocContext, id: string, hard = false): Promise<DocOutput | { deleted: true } | null> {
    const doc = await this.em.findOne(Document, { org: ctx.orgId, id } as never);
    if (!doc) return null;

    if (hard) {
      await removeDocIndex(this.em, ctx.orgId, doc.id);
      this.em.remove(doc);
      await this.em.flush();
      return { deleted: true };
    }

    doc.archived = true;
    doc.updatedAt = new Date();
    this.em.persist(doc);
    await archiveDocIndex(this.em, ctx.orgId, doc.id);
    await this.em.flush();
    return serializeDoc(doc);
  }

  // ── Comments ───────────────────────────────────────────────────

  async listComments(ctx: DocContext, docId: string, resolved?: boolean): Promise<CommentOutput[]> {
    const doc = await this.em.findOne(Document, { org: ctx.orgId, id: docId } as never);
    if (!doc) {
      throw new AppNotFoundError("Document not found.");
    }

    const comments = await this.em.find(DocComment, {
      org: ctx.orgId,
      doc: docId,
      resolved: resolved ?? false,
    } as never, {
      populate: ["org", "doc", "author", "parentComment"],
      orderBy: { createdAt: "ASC", id: "ASC" },
    });

    const roots = comments
      .filter((c) => c.parentComment === null)
      .sort((a, b) => anchorPosition(a) - anchorPosition(b));
    const repliesByParent = new Map<string, DocComment[]>();
    for (const comment of comments) {
      const parentId = comment.parentComment?.id;
      if (!parentId) continue;
      const replies = repliesByParent.get(parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(parentId, replies);
    }

    return roots.map((c) => serializeComment(
      c,
      (repliesByParent.get(c.id) ?? []).map((r) => serializeCommentReply(r)),
    ));
  }

  async createComment(ctx: DocContext, input: {
    docId: string;
    anchorRange?: Record<string, unknown> | null;
    bodyMd: string;
    parentCommentId?: string | null;
  }): Promise<CommentOutput> {
    const doc = await this.em.findOne(Document, { org: ctx.orgId, id: input.docId, archived: false } as never);
    if (!doc) {
      throw new AppNotFoundError("Document not found.");
    }

    let parentComment: DocComment | null = null;
    if (input.parentCommentId) {
      parentComment = await this.em.findOne(DocComment, {
        org: ctx.orgId,
        doc: input.docId,
        id: input.parentCommentId,
      } as never);
      if (!parentComment) {
        throw new AppNotFoundError("Parent comment not found.");
      }
    }

    const author = await this.em.findOne(User, { orgId: ctx.orgId, id: ctx.userId });
    const comment = this.em.create(DocComment, {
      id: randomUUID(),
      org: this.em.getReference(Org, ctx.orgId),
      doc,
      anchorRange: input.anchorRange ?? null,
      author,
      bodyMd: input.bodyMd,
      parentComment,
      resolved: parentComment?.resolved ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    this.em.persist(comment);
    await this.em.flush();
    return serializeComment(comment);
  }

  async updateComment(ctx: DocContext, id: string, bodyMd: string): Promise<CommentOutput | null> {
    const comment = await findComment(this.em, ctx.orgId, id);
    if (!comment) return null;
    if (comment.author?.id !== ctx.userId) {
      throw new AppForbiddenError("Only the author can update this comment.");
    }
    comment.bodyMd = bodyMd;
    comment.updatedAt = new Date();
    this.em.persist(comment);
    await this.em.flush();
    return serializeComment(comment);
  }

  async deleteComment(ctx: DocContext, id: string): Promise<{ deleted: true } | null> {
    const comment = await findComment(this.em, ctx.orgId, id);
    if (!comment) return null;
    await assertCommentDeleteAllowed(this.em, ctx, comment);
    this.em.remove(comment);
    await this.em.flush();
    return { deleted: true };
  }

  async resolveComment(ctx: DocContext, id: string, resolved: boolean): Promise<CommentOutput | null> {
    const comment = await findComment(this.em, ctx.orgId, id);
    if (!comment) return null;
    if (comment.parentComment) {
      throw new AppValidationError("Only root comment threads can be resolved.");
    }
    comment.resolved = resolved;
    comment.updatedAt = new Date();
    this.em.persist(comment);
    await this.em.flush();
    return serializeComment(comment);
  }

  // ── Versions ───────────────────────────────────────────────────

  async listVersions(ctx: DocContext, docId: string): Promise<Array<{
    id: string;
    versionNum: number;
    isSnapshot: boolean;
    authorId: string | null;
    createdAt: Date;
  }>> {
    await requireDoc(this.em, ctx.orgId, docId);
    const versions = await this.em.find(DocVersion, {
      org: ctx.orgId,
      doc: docId,
    } as never, {
      populate: ["author"],
      orderBy: { versionNum: "DESC" },
    });
    return versions.map((v) => ({
      id: v.id,
      versionNum: v.versionNum,
      isSnapshot: v.snapshot !== null,
      authorId: v.author?.id ?? null,
      createdAt: v.createdAt,
    }));
  }

  async getVersion(ctx: DocContext, docId: string, versionNum: number): Promise<VersionOutput | null> {
    await requireDoc(this.em, ctx.orgId, docId);
    const version = await this.em.findOne(DocVersion, {
      org: ctx.orgId,
      doc: docId,
      versionNum,
    } as never, {
      populate: ["author", "restoreOf"],
    });
    return version ? serializeVersion(version) : null;
  }

  async diffVersions(ctx: DocContext, docId: string, fromNum: number, toNum: number): Promise<{ html: string }> {
    await requireDoc(this.em, ctx.orgId, docId);
    const from = await reconstructDocVersion(this.em, { orgId: ctx.orgId, docId, versionNum: fromNum });
    const to = await reconstructDocVersion(this.em, { orgId: ctx.orgId, docId, versionNum: toNum });
    return { html: diffDocVersionsHtml(from.contentJson, to.contentJson) };
  }

  async restoreVersion(ctx: DocContext, docId: string, versionNum: number): Promise<DocOutput> {
    const doc = await requireDoc(this.em, ctx.orgId, docId);
    const reconstructed = await reconstructDocVersion(this.em, { orgId: ctx.orgId, docId, versionNum });

    doc.bodyMd = reconstructed.bodyMd;
    doc.contentJson = reconstructed.contentJson;
    doc.updatedAt = new Date();
    this.em.persist(doc);
    await syncDocWikilinks(this.em, ctx.orgId, doc, doc.contentJson);
    await writeDocVersion(this.em, {
      orgId: ctx.orgId,
      doc,
      authorId: ctx.userId,
      restoreOf: reconstructed.version,
    });
    await upsertSearchDocument(this.em, ctx.orgId, doc.id, ctx.userId);
    await this.em.flush();
    return serializeDoc(doc);
  }

  // ── Links ──────────────────────────────────────────────────────

  async listBacklinks(orgId: string, docId: string): Promise<Array<{
    fromDocId: string;
    title: string;
    slug: string;
    linkKind: "wikilink";
  }>> {
    const links = await this.em.find(DocLink, {
      org: orgId,
      toDoc: docId,
      linkKind: "wikilink",
    } as never, {
      populate: ["fromDoc"],
      orderBy: { createdAt: "ASC", id: "ASC" },
    });

    return links.map((link) => {
      const from = link.fromDoc;
      const frontmatter = from.frontmatter ?? {};
      return {
        fromDocId: from.id,
        title: typeof frontmatter.title === "string" ? frontmatter.title : from.externalId ?? from.id,
        slug: from.externalId ?? from.id,
        linkKind: "wikilink" as const,
      };
    });
  }

  async listForwardLinks(orgId: string, docId: string): Promise<Array<{
    toDocId: string | null;
    toSlug: string;
    linkKind: "wikilink";
  }>> {
    const links = await this.em.find(DocLink, {
      org: orgId,
      fromDoc: docId,
      linkKind: "wikilink",
    } as never, {
      populate: ["toDoc"],
      orderBy: { createdAt: "ASC", id: "ASC" },
    });

    return links.map((link) => ({
      toDocId: link.toDoc?.id ?? null,
      toSlug: link.toSlug,
      linkKind: "wikilink" as const,
    }));
  }
}

// ── Pure helpers (moved from router) ─────────────────────────────

function persistExplicitDocLinks(
  em: EntityManager,
  orgId: string,
  doc: Document,
  links: Array<{
    kind?: string;
    id?: string;
    targetKind?: string;
    targetId?: string;
    linkKind?: LinkKind;
  }> | undefined,
): void {
  for (const link of links ?? []) {
    const targetKind = link.targetKind ?? link.kind;
    const targetId = link.targetId ?? link.id;
    if (!targetKind || !targetId) continue;
    const linkKind = link.linkKind ?? linkKindForTarget(targetKind);
    em.persist(em.create(DocLink, {
      org: em.getReference(Org, orgId),
      fromDoc: doc,
      toDoc: null,
      toSlug: `${targetKind}:${targetId}`,
      linkKind,
    }));
  }
}

function linkKindForTarget(targetKind: string): LinkKind {
  if (targetKind === "task") return "task_ref";
  if (targetKind === "run" || targetKind === "agent_run") return "run_ref";
  return "mention";
}

export function serializeDoc(doc: Document): DocOutput {
  const frontmatter = doc.frontmatter ?? {};
  const title = typeof frontmatter.title === "string" ? frontmatter.title : doc.externalId ?? doc.id;
  return {
    id: doc.id,
    orgId: doc.org.id,
    title,
    slug: doc.externalId ?? doc.id,
    parentId: doc.parent?.id ?? null,
    projectId: doc.projectId,
    scope: doc.scope,
    docType: doc.docType,
    frontmatter,
    bodyMd: doc.bodyMd,
    contentJson: doc.contentJson,
    sortPosition: doc.sortPosition,
    archived: doc.archived,
    externalId: doc.externalId,
    updatedAt: doc.updatedAt,
  };
}

function serializeCommentReply(comment: DocComment): CommentReplyOutput {
  return {
    id: comment.id,
    orgId: comment.org.id,
    docId: comment.doc.id,
    anchorRange: comment.anchorRange,
    authorId: comment.author?.id ?? null,
    bodyMd: comment.bodyMd,
    parentCommentId: comment.parentComment?.id ?? null,
    resolved: comment.resolved,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies: [] as never[],
  };
}

function serializeComment(comment: DocComment, replies: CommentReplyOutput[] = []): CommentOutput {
  return {
    id: comment.id,
    orgId: comment.org.id,
    docId: comment.doc.id,
    anchorRange: comment.anchorRange,
    authorId: comment.author?.id ?? null,
    bodyMd: comment.bodyMd,
    parentCommentId: comment.parentComment?.id ?? null,
    resolved: comment.resolved,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies,
  };
}

function serializeVersion(version: DocVersion): VersionOutput {
  return {
    id: version.id,
    versionNum: version.versionNum,
    isSnapshot: version.snapshot !== null,
    authorId: version.author?.id ?? null,
    createdAt: version.createdAt,
    bodyMdSnapshot: version.bodyMdSnapshot,
    restoreOfId: version.restoreOf?.id ?? null,
  };
}

function markdownToTipTap(markdown: string): Record<string, unknown> {
  const paragraphs = markdown.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function slugBase(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "doc";
}

function slugSuffix(): string {
  return randomBytes(4).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "0");
}

async function uniqueSlug(em: EntityManager, orgId: string, title: string): Promise<string> {
  const prefix = `${slugBase(title)}-${slugSuffix()}`;
  let slug = prefix;
  let counter = 2;
  while (await em.findOne(Document, { org: orgId, externalId: slug } as never)) {
    slug = `${prefix}-${counter}`;
    counter += 1;
  }
  return slug;
}

async function findDocByInput(
  em: EntityManager,
  orgId: string,
  input: { id?: string; slug?: string; includeArchived?: boolean },
): Promise<Document | null> {
  const where = input.id
    ? { org: orgId, id: input.id }
    : { org: orgId, externalId: input.slug };
  return em.findOne(Document, {
    ...where,
    ...(input.includeArchived ? {} : { archived: false }),
  } as never);
}

async function upsertSearchDocument(
  em: EntityManager,
  orgId: string,
  docId: string,
  authorId: string | null = null,
): Promise<void> {
  const doc = await em.findOne(Document, { org: orgId, id: docId } as never, { populate: ["org"] });
  if (!doc) return;
  await indexDoc(em, doc, authorId);
}

async function resolveParent(
  em: EntityManager,
  orgId: string,
  parentId: string | null | undefined,
): Promise<Document | null> {
  if (parentId === undefined || parentId === null) return null;
  const parent = await em.findOne(Document, { org: orgId, id: parentId, archived: false } as never);
  if (!parent) {
    throw new AppNotFoundError("Parent document not found.");
  }
  return parent;
}

async function requireDoc(em: EntityManager, orgId: string, docId: string): Promise<Document> {
  const doc = await em.findOne(Document, { org: orgId, id: docId, archived: false } as never);
  if (!doc) {
    throw new AppNotFoundError("Document not found.");
  }
  return doc;
}

function anchorPosition(comment: DocComment): number {
  const from = comment.anchorRange?.from;
  return typeof from === "number" ? from : Number.MAX_SAFE_INTEGER;
}

async function findComment(em: EntityManager, orgId: string, id: string): Promise<DocComment | null> {
  return em.findOne(DocComment, { org: orgId, id } as never, {
    populate: ["org", "doc", "author", "parentComment"],
  });
}

async function assertCommentDeleteAllowed(
  em: EntityManager,
  ctx: DocContext,
  comment: DocComment,
): Promise<void> {
  if (comment.author?.id === ctx.userId) return;
  const user = await em.findOne(User, { orgId: ctx.orgId, id: ctx.userId });
  if (user?.role === "owner" || user?.role === "admin") return;
  throw new AppForbiddenError("Only the author or an org admin can delete this comment.");
}
