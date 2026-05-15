import { randomUUID } from "node:crypto";
import { DataSource, In } from "typeorm";

import {
  type FulcrumDocument,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import {
  type KnowledgeWorkspaceBacklink,
  KnowledgeWorkspaceBacklinkEntity,
  type KnowledgeWorkspaceComment,
  KnowledgeWorkspaceCommentEntity,
  type KnowledgeWorkspacePage,
  KnowledgeWorkspacePageEntity,
  type KnowledgeWorkspacePageHistory,
  KnowledgeWorkspacePageHistoryEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";

export interface DocumentPublicRow {
  id: string;
  projectId: string;
  title: string;
  type: string;
  bodyMd: string;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentCommentPublicRow {
  id: string;
  docId: string;
  pageId: string;
  parentCommentId: string | null;
  authorId: string;
  bodyMd: string;
  content: Record<string, unknown>;
  selection: Record<string, unknown> | null;
  status: string;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentLinkPublicRow {
  id: string;
  sourceDocId: string;
  targetDocId: string;
  sourcePageId: string;
  targetPageId: string;
  linkType: string;
  traceId: string;
  createdAt: string | null;
}

export interface DocumentVersionPublicRow {
  id: string;
  docId: string;
  pageId: string;
  version: number;
  title: string;
  bodyMd: string;
  contributorIds: string[];
  traceId: string;
  createdAt: string | null;
}

export class DocumentPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId?: string;
    projectId?: string;
    type?: string;
  }): Promise<DocumentPublicRow[]> {
    const projectIds = await this.resolveProjectIds(input);
    if (projectIds.length === 0) return [];

    const documents = await this.documentRepository().find({
      where: {
        projectId: projectIds.length === 1 ? projectIds[0] : In(projectIds),
        ...(input.type ? { sourceType: input.type } : {}),
      },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return documents.map(toPublicRow);
  }

  async listTemplates(input: {
    projectId?: string;
  }): Promise<DocumentPublicRow[]> {
    return await this.list({ projectId: input.projectId, type: "template" });
  }

  async resolveTemplate(input: {
    projectId?: string;
    docType?: string;
  }): Promise<Record<string, unknown>> {
    const templates = await this.listTemplates({ projectId: input.projectId });
    const normalizedType = input.docType?.toLowerCase();
    const template = normalizedType
      ? templates.find((doc) => doc.title.toLowerCase().includes(normalizedType)) ?? templates[0] ?? null
      : templates[0] ?? null;
    return {
      docType: input.docType ?? null,
      template,
    };
  }

  async create(input: {
    projectId?: string;
    title: string;
    docType?: string;
    bodyMd?: string;
  }): Promise<DocumentPublicRow | null> {
    if (!input.projectId) return null;
    const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({ id: input.projectId });
    if (!project) return null;

    const id = randomUUID();
    const document = await this.documentRepository().save({
      id,
      projectId: input.projectId,
      title: input.title,
      bodyMd: input.bodyMd ?? "",
      sourceType: input.docType ?? "note",
      traceId: `trace-document-${id}`,
    });
    return toPublicRow(document);
  }

  async get(input: { id: string }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    return document ? toPublicRow(document) : null;
  }

  async update(input: {
    id: string;
    title?: string;
    docType?: string;
    bodyMd?: string;
  }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    if (!document) return null;
    const page = await this.ensurePageForDocument(document.id);
    if (page) await this.appendPageHistory(page);

    if (input.title !== undefined) document.title = input.title;
    if (input.docType !== undefined) document.sourceType = input.docType;
    if (input.bodyMd !== undefined) document.bodyMd = input.bodyMd;
    const saved = await this.documentRepository().save(document);
    if (page) {
      if (input.title !== undefined) page.title = input.title;
      if (input.bodyMd !== undefined) page.bodyMd = input.bodyMd;
      page.traceId = document.traceId;
      await this.pageRepository().save(page);
    }
    return toPublicRow(saved);
  }

  async delete(input: { id: string }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    if (!document) return null;

    await this.documentRepository().remove(document);
    return toPublicRow(document);
  }

  async listComments(input: {
    docId: string;
    resolved?: boolean | string;
  }): Promise<DocumentCommentPublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const status = resolvedStatus(input.resolved);
    const comments = await this.commentRepository().find({
      where: {
        pageId: page.id,
        ...(status ? { status } : {}),
      },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return comments.map((comment) => toCommentPublicRow(comment, page));
  }

  async createComment(input: {
    docId: string;
    authorId: string;
    bodyMd: string;
    parentCommentId?: string;
    selection?: Record<string, unknown> | null;
    traceId?: string;
  }): Promise<DocumentCommentPublicRow | null> {
    const page = await this.ensurePageForDocument(input.docId);
    if (!page) return null;
    const comment = await this.commentRepository().save({
      id: randomUUID(),
      pageId: page.id,
      parentCommentId: input.parentCommentId ?? null,
      authorId: input.authorId,
      content: { bodyMd: input.bodyMd },
      selection: input.selection ?? null,
      status: "open",
      traceId: input.traceId ?? page.traceId,
    });
    return toCommentPublicRow(comment, page);
  }

  async updateComment(input: {
    commentId: string;
    bodyMd?: string;
    selection?: Record<string, unknown> | null;
    status?: string;
  }): Promise<DocumentCommentPublicRow | null> {
    const comment = await this.commentRepository().findOneBy({ id: input.commentId });
    if (!comment) return null;
    const page = await this.pageRepository().findOneBy({ id: comment.pageId });
    if (!page) return null;

    if (input.bodyMd !== undefined) comment.content = { ...comment.content, bodyMd: input.bodyMd };
    if (input.selection !== undefined) comment.selection = input.selection;
    if (input.status !== undefined) comment.status = input.status;
    return toCommentPublicRow(await this.commentRepository().save(comment), page);
  }

  async resolveComment(input: {
    commentId: string;
    resolved?: boolean | string;
  }): Promise<DocumentCommentPublicRow | null> {
    return await this.updateComment({
      commentId: input.commentId,
      status: input.resolved === false || input.resolved === "false" ? "open" : "resolved",
    });
  }

  async deleteComment(input: { commentId: string }): Promise<DocumentCommentPublicRow | null> {
    const comment = await this.commentRepository().findOneBy({ id: input.commentId });
    if (!comment) return null;
    const page = await this.pageRepository().findOneBy({ id: comment.pageId });
    if (!page) return null;

    await this.commentRepository().remove(comment);
    return toCommentPublicRow(comment, page);
  }

  async listBacklinks(input: { docId: string }): Promise<DocumentLinkPublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const links = await this.backlinkRepository().find({
      where: { targetPageId: page.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return await this.mapLinks(links);
  }

  async listForwardLinks(input: { docId: string }): Promise<DocumentLinkPublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const links = await this.backlinkRepository().find({
      where: { sourcePageId: page.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return await this.mapLinks(links);
  }

  async createLink(input: {
    sourceDocId: string;
    targetDocId: string;
    linkType?: string;
    traceId?: string;
  }): Promise<DocumentLinkPublicRow | null> {
    const source = await this.ensurePageForDocument(input.sourceDocId);
    const target = await this.ensurePageForDocument(input.targetDocId);
    if (!source || !target) return null;

    const linkType = input.linkType ?? "wikilink";
    const existing = await this.backlinkRepository().findOneBy({
      sourcePageId: source.id,
      targetPageId: target.id,
      linkType,
    });
    const link = existing ?? await this.backlinkRepository().save({
      id: randomUUID(),
      sourcePageId: source.id,
      targetPageId: target.id,
      linkType,
      traceId: input.traceId ?? source.traceId,
    });
    return toLinkPublicRow(link, source, target);
  }

  async deleteLink(input: { linkId: string }): Promise<DocumentLinkPublicRow | null> {
    const link = await this.backlinkRepository().findOneBy({ id: input.linkId });
    if (!link) return null;
    const [source, target] = await Promise.all([
      this.pageRepository().findOneBy({ id: link.sourcePageId }),
      this.pageRepository().findOneBy({ id: link.targetPageId }),
    ]);
    if (!source || !target) return null;

    await this.backlinkRepository().remove(link);
    return toLinkPublicRow(link, source, target);
  }

  async listVersions(input: { docId: string }): Promise<DocumentVersionPublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const versions = await this.historyRepository().find({
      where: { pageId: page.id },
      order: { version: "DESC" },
    });
    return versions.map((version) => toVersionPublicRow(version, page));
  }

  async getVersion(input: { docId: string; version: number }): Promise<DocumentVersionPublicRow | null> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return null;
    const version = await this.historyRepository().findOneBy({ pageId: page.id, version: input.version });
    return version ? toVersionPublicRow(version, page) : null;
  }

  async getVersionById(input: { docId: string; versionId: string }): Promise<DocumentVersionPublicRow | null> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return null;
    const version = await this.historyRepository().findOneBy({ pageId: page.id, id: input.versionId });
    return version ? toVersionPublicRow(version, page) : null;
  }

  async diffVersions(input: {
    docId: string;
    fromVersion: number;
    toVersion: number;
  }): Promise<Record<string, unknown> | null> {
    const from = await this.getVersion({ docId: input.docId, version: input.fromVersion });
    const to = await this.getVersion({ docId: input.docId, version: input.toVersion });
    if (!from || !to) return null;
    return {
      docId: input.docId,
      from,
      to,
      titleChanged: from.title !== to.title,
      bodyChanged: from.bodyMd !== to.bodyMd,
      bodyMdBefore: from.bodyMd,
      bodyMdAfter: to.bodyMd,
    };
  }

  async diffVersionById(input: {
    docId: string;
    versionId: string;
  }): Promise<Record<string, unknown> | null> {
    const target = await this.getVersionById(input);
    if (!target) return null;
    if (target.version <= 1) {
      return {
        docId: input.docId,
        versionId: input.versionId,
        hasDiff: false,
        from: null,
        to: target,
      };
    }
    const previous = await this.getVersion({ docId: input.docId, version: target.version - 1 });
    if (!previous) return null;
    return {
      docId: input.docId,
      versionId: input.versionId,
      hasDiff: true,
      from: previous,
      to: target,
      titleChanged: previous.title !== target.title,
      bodyChanged: previous.bodyMd !== target.bodyMd,
      bodyMdBefore: previous.bodyMd,
      bodyMdAfter: target.bodyMd,
    };
  }

  async restoreVersion(input: { docId: string; version: number }): Promise<DocumentPublicRow | null> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return null;
    const version = await this.historyRepository().findOneBy({ pageId: page.id, version: input.version });
    if (!version) return null;
    const document = await this.documentRepository().findOneBy({ id: input.docId });
    if (!document) return null;

    await this.appendPageHistory(page);
    page.title = version.title;
    page.bodyMd = version.bodyMd;
    page.editorJson = version.editorJson;
    page.yjsState = version.yjsState;
    page.traceId = version.traceId;
    document.title = version.title;
    document.bodyMd = version.bodyMd;
    document.traceId = version.traceId;
    await this.pageRepository().save(page);
    return toPublicRow(await this.documentRepository().save(document));
  }

  async restoreVersionById(input: { docId: string; versionId: string }): Promise<DocumentPublicRow | null> {
    const target = await this.getVersionById(input);
    if (!target) return null;
    return await this.restoreVersion({ docId: input.docId, version: target.version });
  }

  private async resolveProjectIds(input: { orgId?: string; projectId?: string }): Promise<string[]> {
    if (input.projectId) {
      const project = await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
        id: input.projectId,
        ...(input.orgId ? { workspaceId: input.orgId } : {}),
      });
      return project ? [project.id] : [];
    }
    if (!input.orgId) return [];

    const projects = await this.dataSource.getRepository(FulcrumProjectEntity).findBy({ workspaceId: input.orgId });
    return projects.map((project) => project.id);
  }

  private documentRepository() {
    return this.dataSource.getRepository(FulcrumDocumentEntity);
  }

  private pageRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspacePageEntity);
  }

  private commentRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceCommentEntity);
  }

  private backlinkRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceBacklinkEntity);
  }

  private historyRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspacePageHistoryEntity);
  }

  private async pageForDocument(documentId: string): Promise<KnowledgeWorkspacePage | null> {
    return await this.pageRepository().findOneBy({ documentId });
  }

  private async ensurePageForDocument(documentId: string): Promise<KnowledgeWorkspacePage | null> {
    const existing = await this.pageForDocument(documentId);
    if (existing) return existing;

    const document = await this.documentRepository().findOneBy({ id: documentId });
    if (!document) return null;
    return await this.pageRepository().save({
      id: randomUUID(),
      projectId: document.projectId,
      documentId: document.id,
      parentPageId: null,
      title: document.title,
      slug: `${slugOf(document.title)}-${document.id.slice(0, 8)}`,
      icon: null,
      position: document.id,
      bodyMd: document.bodyMd,
      editorJson: {},
      yjsState: null,
      traceId: document.traceId,
    });
  }

  private async mapLinks(links: KnowledgeWorkspaceBacklink[]): Promise<DocumentLinkPublicRow[]> {
    const pageIds = [...new Set(links.flatMap((link) => [link.sourcePageId, link.targetPageId]))];
    const pages = pageIds.length
      ? await this.pageRepository().findBy({ id: In(pageIds) })
      : [];
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    return links.flatMap((link) => {
      const source = pagesById.get(link.sourcePageId);
      const target = pagesById.get(link.targetPageId);
      if (!source || !target) return [];
      return [toLinkPublicRow(link, source, target)];
    });
  }

  private async appendPageHistory(page: KnowledgeWorkspacePage): Promise<KnowledgeWorkspacePageHistory> {
    const latest = await this.historyRepository().findOne({
      where: { pageId: page.id },
      order: { version: "DESC" },
    });
    return await this.historyRepository().save({
      id: randomUUID(),
      pageId: page.id,
      version: (latest?.version ?? 0) + 1,
      title: page.title,
      bodyMd: page.bodyMd,
      editorJson: page.editorJson,
      yjsState: page.yjsState,
      contributorIds: [],
      traceId: page.traceId,
    });
  }
}

function toPublicRow(document: FulcrumDocument): DocumentPublicRow {
  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    type: document.sourceType,
    bodyMd: document.bodyMd,
    traceId: document.traceId,
    createdAt: document.createdAt?.toISOString() ?? null,
    updatedAt: document.updatedAt?.toISOString() ?? null,
  };
}

function toCommentPublicRow(
  comment: KnowledgeWorkspaceComment,
  page: KnowledgeWorkspacePage,
): DocumentCommentPublicRow {
  return {
    id: comment.id,
    docId: page.documentId,
    pageId: comment.pageId,
    parentCommentId: comment.parentCommentId,
    authorId: comment.authorId,
    bodyMd: typeof comment.content["bodyMd"] === "string" ? comment.content["bodyMd"] : "",
    content: comment.content,
    selection: comment.selection,
    status: comment.status,
    traceId: comment.traceId,
    createdAt: comment.createdAt?.toISOString() ?? null,
    updatedAt: comment.updatedAt?.toISOString() ?? null,
  };
}

function toLinkPublicRow(
  link: KnowledgeWorkspaceBacklink,
  source: KnowledgeWorkspacePage,
  target: KnowledgeWorkspacePage,
): DocumentLinkPublicRow {
  return {
    id: link.id,
    sourceDocId: source.documentId,
    targetDocId: target.documentId,
    sourcePageId: source.id,
    targetPageId: target.id,
    linkType: link.linkType,
    traceId: link.traceId,
    createdAt: link.createdAt?.toISOString() ?? null,
  };
}

function toVersionPublicRow(
  version: KnowledgeWorkspacePageHistory,
  page: KnowledgeWorkspacePage,
): DocumentVersionPublicRow {
  return {
    id: version.id,
    docId: page.documentId,
    pageId: version.pageId,
    version: version.version,
    title: version.title,
    bodyMd: version.bodyMd,
    contributorIds: version.contributorIds,
    traceId: version.traceId,
    createdAt: version.createdAt?.toISOString() ?? null,
  };
}

function resolvedStatus(value: boolean | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value === true || value === "true" ? "resolved" : "open";
}

function slugOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doc";
}
