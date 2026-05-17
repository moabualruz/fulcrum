import { EntitySchema } from "typeorm";

export interface KnowledgeWorkspacePage {
  id: string;
  projectId: string;
  documentId: string;
  parentPageId: string | null;
  title: string;
  slug: string;
  icon: string | null;
  position: string;
  bodyMd: string;
  editorJson: Record<string, unknown>;
  yjsState: string | null;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KnowledgeWorkspacePageHistory {
  id: string;
  pageId: string;
  version: number;
  title: string;
  bodyMd: string;
  editorJson: Record<string, unknown>;
  yjsState: string | null;
  contributorIds: string[];
  traceId: string;
  createdAt?: Date;
}

export interface KnowledgeWorkspaceComment {
  id: string;
  pageId: string;
  parentCommentId: string | null;
  authorId: string;
  content: Record<string, unknown>;
  selection: Record<string, unknown> | null;
  status: string;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KnowledgeWorkspaceAttachment {
  id: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  checksumSha256: string | null;
  traceId: string;
  createdAt?: Date;
}

export interface KnowledgeWorkspaceBacklink {
  id: string;
  sourcePageId: string;
  targetPageId: string;
  linkType: string;
  traceId: string;
  createdAt?: Date;
}

export interface KnowledgeWorkspaceCollaborationState {
  id: string;
  pageId: string;
  provider: string;
  stateVector: string | null;
  documentState: string | null;
  activeClientIds: string[];
  traceId: string;
  updatedAt?: Date;
}

export interface KnowledgeWorkspaceSearchEntry {
  id: string;
  pageId: string;
  projectId: string;
  sourceKind: string;
  title: string;
  searchText: string;
  excerpt: string | null;
  traceId: string;
  updatedAt?: Date;
}

export interface KnowledgeWorkspaceSavedSearch {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  queryJson: Record<string, unknown>;
  scope: string;
  projectId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const timestampColumns = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

const createdAtColumn = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
} as const;

const updatedAtColumn = {
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

export const KnowledgeWorkspacePageEntity = new EntitySchema<KnowledgeWorkspacePage>({
  name: "KnowledgeWorkspacePage",
  tableName: "fulcrum_doc_pages",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    documentId: { name: "document_id", type: "varchar", length: 128 },
    parentPageId: { name: "parent_page_id", type: "varchar", length: 128, nullable: true },
    title: { type: "varchar", length: 320 },
    slug: { type: "varchar", length: 220 },
    icon: { type: "varchar", length: 80, nullable: true },
    position: { type: "varchar", length: 160 },
    bodyMd: { name: "body_md", type: "text" },
    editorJson: { name: "editor_json", type: "jsonb", default: () => "'{}'::jsonb" },
    yjsState: { name: "yjs_state", type: "text", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_doc_pages_project_slug_key", columns: ["projectId", "slug"] }],
  indices: [
    { name: "fulcrum_doc_pages_project_parent_idx", columns: ["projectId", "parentPageId"] },
    { name: "fulcrum_doc_pages_trace_idx", columns: ["traceId"] },
  ],
});

export const KnowledgeWorkspacePageHistoryEntity = new EntitySchema<KnowledgeWorkspacePageHistory>({
  name: "KnowledgeWorkspacePageHistory",
  tableName: "fulcrum_doc_page_history",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    pageId: { name: "page_id", type: "varchar", length: 128 },
    version: { type: "int" },
    title: { type: "varchar", length: 320 },
    bodyMd: { name: "body_md", type: "text" },
    editorJson: { name: "editor_json", type: "jsonb", default: () => "'{}'::jsonb" },
    yjsState: { name: "yjs_state", type: "text", nullable: true },
    contributorIds: {
      name: "contributor_ids",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_doc_page_history_page_version_key", columns: ["pageId", "version"] }],
});

export const KnowledgeWorkspaceCommentEntity = new EntitySchema<KnowledgeWorkspaceComment>({
  name: "KnowledgeWorkspaceComment",
  tableName: "fulcrum_doc_comments",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    pageId: { name: "page_id", type: "varchar", length: 128 },
    parentCommentId: { name: "parent_comment_id", type: "varchar", length: 128, nullable: true },
    authorId: { name: "author_id", type: "varchar", length: 128 },
    content: { type: "jsonb", default: () => "'{}'::jsonb" },
    selection: { type: "jsonb", nullable: true },
    status: { type: "varchar", length: 80 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_doc_comments_page_status_idx", columns: ["pageId", "status"] }],
});

export const KnowledgeWorkspaceAttachmentEntity = new EntitySchema<KnowledgeWorkspaceAttachment>({
  name: "KnowledgeWorkspaceAttachment",
  tableName: "fulcrum_doc_attachments",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    pageId: { name: "page_id", type: "varchar", length: 128 },
    fileName: { name: "file_name", type: "varchar", length: 320 },
    mimeType: { name: "mime_type", type: "varchar", length: 160 },
    sizeBytes: { name: "size_bytes", type: "bigint" },
    storagePath: { name: "storage_path", type: "text" },
    checksumSha256: { name: "checksum_sha256", type: "varchar", length: 80, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  indices: [{ name: "fulcrum_doc_attachments_page_idx", columns: ["pageId"] }],
});

export const KnowledgeWorkspaceBacklinkEntity = new EntitySchema<KnowledgeWorkspaceBacklink>({
  name: "KnowledgeWorkspaceBacklink",
  tableName: "fulcrum_doc_backlinks",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    sourcePageId: { name: "source_page_id", type: "varchar", length: 128 },
    targetPageId: { name: "target_page_id", type: "varchar", length: 128 },
    linkType: { name: "link_type", type: "varchar", length: 80 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_doc_backlinks_unique_edge", columns: ["sourcePageId", "targetPageId", "linkType"] }],
  indices: [
    { name: "fulcrum_doc_backlinks_source_idx", columns: ["sourcePageId"] },
    { name: "fulcrum_doc_backlinks_target_idx", columns: ["targetPageId"] },
  ],
});

export const KnowledgeWorkspaceCollaborationStateEntity = new EntitySchema<KnowledgeWorkspaceCollaborationState>({
  name: "KnowledgeWorkspaceCollaborationState",
  tableName: "fulcrum_doc_collaboration_states",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    pageId: { name: "page_id", type: "varchar", length: 128 },
    provider: { type: "varchar", length: 80 },
    stateVector: { name: "state_vector", type: "text", nullable: true },
    documentState: { name: "document_state", type: "text", nullable: true },
    activeClientIds: {
      name: "active_client_ids",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...updatedAtColumn,
  },
  uniques: [{ name: "fulcrum_doc_collaboration_states_page_provider_key", columns: ["pageId", "provider"] }],
});

export const KnowledgeWorkspaceSearchEntryEntity = new EntitySchema<KnowledgeWorkspaceSearchEntry>({
  name: "KnowledgeWorkspaceSearchEntry",
  tableName: "fulcrum_doc_search_entries",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    pageId: { name: "page_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    sourceKind: { name: "source_kind", type: "varchar", length: 80, default: "page" },
    title: { type: "varchar", length: 320 },
    searchText: { name: "search_text", type: "text" },
    excerpt: { type: "text", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...updatedAtColumn,
  },
  uniques: [{ name: "fulcrum_doc_search_entries_page_key", columns: ["pageId"] }],
  indices: [
    { name: "fulcrum_doc_search_entries_project_idx", columns: ["projectId"] },
    { name: "fulcrum_doc_search_entries_project_source_idx", columns: ["projectId", "sourceKind"] },
  ],
});

export const KnowledgeWorkspaceSavedSearchEntity = new EntitySchema<KnowledgeWorkspaceSavedSearch>({
  name: "KnowledgeWorkspaceSavedSearch",
  tableName: "fulcrum_saved_searches",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    workspaceId: { name: "workspace_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 220 },
    queryJson: {
      name: "query_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    scope: { type: "varchar", length: 80 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_saved_searches_workspace_user_idx", columns: ["workspaceId", "userId"] },
    { name: "fulcrum_saved_searches_workspace_scope_idx", columns: ["workspaceId", "scope"] },
  ],
});

export const KNOWLEDGE_WORKSPACE_ENTITIES = [
  KnowledgeWorkspacePageEntity,
  KnowledgeWorkspacePageHistoryEntity,
  KnowledgeWorkspaceCommentEntity,
  KnowledgeWorkspaceAttachmentEntity,
  KnowledgeWorkspaceBacklinkEntity,
  KnowledgeWorkspaceCollaborationStateEntity,
  KnowledgeWorkspaceSearchEntryEntity,
  KnowledgeWorkspaceSavedSearchEntity,
];
