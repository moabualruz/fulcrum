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
  type KnowledgeWorkspaceAttachment,
  KnowledgeWorkspaceAttachmentEntity,
  type KnowledgeWorkspaceCollaborationState,
  KnowledgeWorkspaceCollaborationStateEntity,
  type KnowledgeWorkspaceComment,
  KnowledgeWorkspaceCommentEntity,
  type KnowledgeWorkspacePage,
  KnowledgeWorkspacePageEntity,
  type KnowledgeWorkspacePageHistory,
  KnowledgeWorkspacePageHistoryEntity,
  type KnowledgeWorkspaceSearchEntry,
  KnowledgeWorkspaceSearchEntryEntity,
} from "@knowledge-workspace/infrastructure/database/document.entities.ts";

export interface DocumentPublicRow {
  id: string;
  projectId: string;
  parentId: string | null;
  sortOrder: number;
  title: string;
  type: string;
  bodyMd: string;
  editorJson: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
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

export interface DocumentAttachmentPublicRow {
  id: string;
  docId: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  checksumSha256: string | null;
  traceId: string;
  createdAt: string | null;
}

export interface DocumentCollaborationStatePublicRow {
  id: string;
  docId: string;
  pageId: string;
  provider: string;
  stateVector: string | null;
  documentState: string | null;
  activeClientIds: string[];
  traceId: string;
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
    const pagesByDocumentId = await this.pagesByDocumentId(documents.map((document) => document.id));
    return documents
      .map((document) => toPublicRow(document, pagesByDocumentId.get(document.id)))
      .sort(compareDocumentRows);
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
    editorJson?: Record<string, unknown>;
    frontmatter?: Record<string, unknown>;
    parentId?: string | null;
    sortPosition?: number;
  }): Promise<DocumentPublicRow | null> {
    if (!input.projectId) return null;
    // `projectId` may arrive as a uuid or a project slug (the Capture-stage
    // create flow passes `?project=<slug>`): resolve either to the canonical id.
    const projectRepo = this.dataSource.getRepository(FulcrumProjectEntity);
    const project =
      (await projectRepo.findOneBy({ id: input.projectId })) ??
      (await projectRepo.findOneBy({ slug: input.projectId }));
    if (!project) return null;

    const id = randomUUID();
    const document = await this.documentRepository().save({
      id,
      projectId: project.id,
      title: input.title,
      bodyMd: input.bodyMd ?? "",
      sourceType: input.docType ?? "note",
      parentId: input.parentId ?? null,
      traceId: `trace-document-${id}`,
    });
    const page = await this.ensurePageForDocument(document.id, {
      parentId: input.parentId ?? null,
      sortPosition: input.sortPosition,
      editorJson: input.editorJson,
    });
    if (page && (input.frontmatter !== undefined || input.editorJson !== undefined)) {
      page.editorJson = documentEditorJson(input.editorJson ?? page.editorJson, input.frontmatter);
      await this.pageRepository().save(page);
    }
    if (page) await this.upsertSearchEntry(document, page);
    return toPublicRow(document, page ?? undefined);
  }

  async get(input: { id: string }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    if (!document) return null;
    const page = await this.pageForDocument(document.id);
    return toPublicRow(document, page ?? undefined);
  }

  async update(input: {
    id: string;
    title?: string;
    docType?: string;
    bodyMd?: string;
    editorJson?: Record<string, unknown>;
    frontmatter?: Record<string, unknown>;
    parentId?: string | null;
    sortPosition?: number;
  }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    if (!document) return null;
    const page = await this.ensurePageForDocument(document.id);
    if (page) await this.appendPageHistory(page);

    if (input.title !== undefined) document.title = input.title;
    if (input.docType !== undefined) document.sourceType = input.docType;
    if (input.bodyMd !== undefined) document.bodyMd = input.bodyMd;
    if (input.parentId !== undefined) document.parentId = input.parentId;
    const saved = await this.documentRepository().save(document);
    if (page) {
      if (input.title !== undefined) page.title = input.title;
      if (input.bodyMd !== undefined) page.bodyMd = input.bodyMd;
      if (input.editorJson !== undefined || input.frontmatter !== undefined) {
        page.editorJson = documentEditorJson(input.editorJson ?? page.editorJson, input.frontmatter);
      }
      if (input.parentId !== undefined) page.parentPageId = await this.resolveParentPageId(document.projectId, input.parentId);
      if (input.sortPosition !== undefined) page.position = String(input.sortPosition);
      page.traceId = document.traceId;
      await this.pageRepository().save(page);
      await this.upsertSearchEntry(saved, page);
    }
    return toPublicRow(saved, page ?? undefined);
  }

  async delete(input: { id: string }): Promise<DocumentPublicRow | null> {
    const document = await this.documentRepository().findOneBy({ id: input.id });
    if (!document) return null;
    const page = await this.pageForDocument(document.id);
    if (page) await this.deleteSearchEntry(page.id);

    await this.documentRepository().remove(document);
    return toPublicRow(document, page ?? undefined);
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

  async listAttachments(input: { docId: string }): Promise<DocumentAttachmentPublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const attachments = await this.attachmentRepository().find({
      where: { pageId: page.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return attachments.map((attachment) => toAttachmentPublicRow(attachment, page));
  }

  async createAttachment(input: {
    docId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    checksumSha256?: string | null;
    traceId?: string;
  }): Promise<DocumentAttachmentPublicRow | null> {
    const page = await this.ensurePageForDocument(input.docId);
    if (!page) return null;
    const attachment = await this.attachmentRepository().save({
      id: randomUUID(),
      pageId: page.id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      checksumSha256: input.checksumSha256 ?? null,
      traceId: input.traceId ?? page.traceId,
    });
    return toAttachmentPublicRow(attachment, page);
  }

  async deleteAttachment(input: { attachmentId: string }): Promise<DocumentAttachmentPublicRow | null> {
    const attachment = await this.attachmentRepository().findOneBy({ id: input.attachmentId });
    if (!attachment) return null;
    const page = await this.pageRepository().findOneBy({ id: attachment.pageId });
    if (!page) return null;

    await this.attachmentRepository().remove(attachment);
    return toAttachmentPublicRow(attachment, page);
  }

  async listCollaborationStates(input: { docId: string }): Promise<DocumentCollaborationStatePublicRow[]> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return [];
    const states = await this.collaborationRepository().find({
      where: { pageId: page.id },
      order: { provider: "ASC", id: "ASC" },
    });
    return states.map((state) => toCollaborationStatePublicRow(state, page));
  }

  async upsertCollaborationState(input: {
    docId: string;
    provider: string;
    stateVector?: string | null;
    documentState?: string | null;
    activeClientIds?: string[];
    traceId?: string;
  }): Promise<DocumentCollaborationStatePublicRow | null> {
    const page = await this.ensurePageForDocument(input.docId);
    if (!page) return null;
    const existing = await this.collaborationRepository().findOneBy({
      pageId: page.id,
      provider: input.provider,
    });
    const state = await this.collaborationRepository().save({
      id: existing?.id ?? randomUUID(),
      pageId: page.id,
      provider: input.provider,
      stateVector: input.stateVector ?? existing?.stateVector ?? null,
      documentState: input.documentState ?? existing?.documentState ?? null,
      activeClientIds: input.activeClientIds ?? existing?.activeClientIds ?? [],
      traceId: input.traceId ?? existing?.traceId ?? page.traceId,
      updatedAt: new Date(),
    });
    return toCollaborationStatePublicRow(state, page);
  }

  async deleteCollaborationState(input: {
    docId: string;
    provider: string;
  }): Promise<DocumentCollaborationStatePublicRow | null> {
    const page = await this.pageForDocument(input.docId);
    if (!page) return null;
    const state = await this.collaborationRepository().findOneBy({
      pageId: page.id,
      provider: input.provider,
    });
    if (!state) return null;

    await this.collaborationRepository().remove(state);
    return toCollaborationStatePublicRow(state, page);
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

  private attachmentRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceAttachmentEntity);
  }

  private collaborationRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceCollaborationStateEntity);
  }

  private backlinkRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceBacklinkEntity);
  }

  private historyRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspacePageHistoryEntity);
  }

  private searchRepository() {
    return this.dataSource.getRepository(KnowledgeWorkspaceSearchEntryEntity);
  }

  private async pageForDocument(documentId: string): Promise<KnowledgeWorkspacePage | null> {
    return await this.pageRepository().findOneBy({ documentId });
  }

  private async pagesByDocumentId(documentIds: string[]): Promise<Map<string, KnowledgeWorkspacePage>> {
    if (documentIds.length === 0) return new Map();
    const pages = await this.pageRepository().findBy({ documentId: In(documentIds) });
    return new Map(pages.map((page) => [page.documentId, page]));
  }

  private async ensurePageForDocument(
    documentId: string,
    input: {
      parentId?: string | null;
      sortPosition?: number;
      editorJson?: Record<string, unknown>;
    } = {},
  ): Promise<KnowledgeWorkspacePage | null> {
    const existing = await this.pageForDocument(documentId);
    if (existing) return existing;

    const document = await this.documentRepository().findOneBy({ id: documentId });
    if (!document) return null;
    return await this.pageRepository().save({
      id: randomUUID(),
      projectId: document.projectId,
      documentId: document.id,
      parentPageId: await this.resolveParentPageId(document.projectId, input.parentId ?? document.parentId),
      title: document.title,
      slug: `${slugOf(document.title)}-${document.id.slice(0, 8)}`,
      icon: null,
      position: input.sortPosition !== undefined ? String(input.sortPosition) : document.id,
      bodyMd: document.bodyMd,
      editorJson: input.editorJson ?? {},
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

  private async upsertSearchEntry(
    document: FulcrumDocument,
    page: KnowledgeWorkspacePage,
  ): Promise<KnowledgeWorkspaceSearchEntry> {
    const existing = await this.searchRepository().findOneBy({ pageId: page.id });
    return await this.searchRepository().save({
      id: existing?.id ?? randomUUID(),
      pageId: page.id,
      projectId: document.projectId,
      sourceKind: "page",
      title: document.title,
      searchText: document.bodyMd,
      excerpt: excerptFrom(document.bodyMd),
      traceId: document.traceId,
      updatedAt: new Date(),
    });
  }

  private async deleteSearchEntry(pageId: string): Promise<void> {
    const existing = await this.searchRepository().findOneBy({ pageId });
    if (existing) await this.searchRepository().remove(existing);
  }

  private async resolveParentPageId(projectId: string, parentId: string | null | undefined): Promise<string | null> {
    if (!parentId) return null;
    const parentPage = await this.pageRepository().findOneBy({ id: parentId, projectId });
    if (parentPage) return parentPage.id;
    const parentDocument = await this.documentRepository().findOneBy({ id: parentId, projectId });
    if (!parentDocument) return parentId;
    return (await this.ensurePageForDocument(parentDocument.id))?.id ?? parentId;
  }
}

function toPublicRow(document: FulcrumDocument, page?: KnowledgeWorkspacePage): DocumentPublicRow {
  return {
    id: document.id,
    projectId: document.projectId,
    parentId: document.parentId ?? page?.parentPageId ?? null,
    sortOrder: numericPosition(page?.position),
    title: document.title,
    type: document.sourceType,
    bodyMd: document.bodyMd,
    editorJson: page?.editorJson ?? {},
    frontmatter: frontmatterFor(document, page),
    traceId: document.traceId,
    createdAt: document.createdAt?.toISOString() ?? null,
    updatedAt: document.updatedAt?.toISOString() ?? null,
  };
}

function numericPosition(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function frontmatterFor(document: FulcrumDocument, page?: KnowledgeWorkspacePage): Record<string, unknown> {
  const raw = page?.editorJson?.["frontmatter"];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return { title: document.title, kind: document.sourceType };
}

function documentEditorJson(
  editorJson: Record<string, unknown>,
  frontmatter: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return frontmatter === undefined ? editorJson : { ...editorJson, frontmatter };
}

function compareDocumentRows(left: DocumentPublicRow, right: DocumentPublicRow): number {
  const leftParent = left.parentId ?? "";
  const rightParent = right.parentId ?? "";
  return leftParent.localeCompare(rightParent)
    || left.sortOrder - right.sortOrder
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id);
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

function toAttachmentPublicRow(
  attachment: KnowledgeWorkspaceAttachment,
  page: KnowledgeWorkspacePage,
): DocumentAttachmentPublicRow {
  return {
    id: attachment.id,
    docId: page.documentId,
    pageId: attachment.pageId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: Number(attachment.sizeBytes),
    storagePath: attachment.storagePath,
    checksumSha256: attachment.checksumSha256,
    traceId: attachment.traceId,
    createdAt: attachment.createdAt?.toISOString() ?? null,
  };
}

function toCollaborationStatePublicRow(
  state: KnowledgeWorkspaceCollaborationState,
  page: KnowledgeWorkspacePage,
): DocumentCollaborationStatePublicRow {
  return {
    id: state.id,
    docId: page.documentId,
    pageId: state.pageId,
    provider: state.provider,
    stateVector: state.stateVector,
    documentState: state.documentState,
    activeClientIds: state.activeClientIds,
    traceId: state.traceId,
    updatedAt: state.updatedAt?.toISOString() ?? null,
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

function excerptFrom(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
