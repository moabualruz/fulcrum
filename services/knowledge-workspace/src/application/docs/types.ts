import type {
  CommentOutput,
  DocOutput,
  VersionOutput,
} from "@knowledge-workspace/application/document-service.ts";
export { DocTypeEnum, ScopeEnum } from "@knowledge-workspace/domain/document-enums.ts";

export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export type DocDto = DocOutput;
export type DocCommentDto = CommentOutput;
export type DocVersionDto = VersionOutput;
export type DocVersionListDto = Omit<VersionOutput, "bodyMdSnapshot" | "restoreOfId">;

export interface CreateDocInput {
  title: string;
  parentId?: string | null;
  bodyMd?: string;
  projectId?: string | null;
  scope?: DocDto["scope"];
  docType?: DocDto["docType"];
  frontmatter?: Record<string, unknown>;
  contentJson?: Record<string, unknown>;
  sortPosition?: number;
  source?: DocSourceRef;
  links?: DocSourceLinkInput[];
}

export interface DocSourceRef {
  kind: "task" | "run" | "artifact" | "memory" | "doc" | string;
  id: string;
}

export interface DocSourceLinkInput extends DocSourceRef {
  targetKind?: string;
  targetId?: string;
  linkKind?: "task_ref" | "run_ref" | "mention" | "wikilink";
}

export interface ListDocsInput {
  scope?: DocDto["scope"];
  docType?: DocDto["docType"];
  archived?: boolean;
  parentId?: string | null;
  limit?: number;
  offset?: number;
}

export interface GetDocInput {
  id?: string;
  slug?: string;
}

export interface UpdateDocInput extends Partial<CreateDocInput> {
  id: string;
  archived?: boolean;
}

export interface CreateDocCommentInput {
  docId: string;
  anchorRange?: Record<string, unknown> | null;
  bodyMd: string;
  parentCommentId?: string | null;
}
