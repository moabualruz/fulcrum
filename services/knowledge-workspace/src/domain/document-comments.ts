import { z } from "zod";

const yjsIdSchema = z.object({
  client: z.number().int().nonnegative(),
  clock: z.number().int().nonnegative(),
});

const yjsRelativePositionSchema = z.object({
  type: yjsIdSchema,
  tname: z.string().nullable(),
  item: yjsIdSchema.nullable(),
  assoc: z.number().int(),
});

export const documentYjsSelectionSchema = z.object({
  anchor: yjsRelativePositionSchema,
  head: yjsRelativePositionSchema,
});

export class DocumentCommentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentCommentError";
  }
}

export interface DocumentCommentPageRef {
  id: string;
  spaceId: string;
}

export interface DocumentCommentUserRef {
  id: string;
  [key: string]: unknown;
}

export interface DocumentParentCommentRef {
  id: string;
  pageId: string;
  parentCommentId?: string | null;
}

export interface DocumentCreateCommentInput {
  content: string;
  selection?: string | null;
  type?: "inline" | "page" | string | null;
  parentCommentId?: string | null;
  yjsSelection?: unknown;
}

export interface PrepareDocumentCommentCreateInput {
  page: DocumentCommentPageRef;
  workspaceId: string;
  user: DocumentCommentUserRef;
  input: DocumentCreateCommentInput;
  parentComment?: DocumentParentCommentRef | null;
  insertedCommentId?: string;
}

export interface DocumentCommentInsert {
  pageId: string;
  content: unknown;
  selection: string | null;
  type: string;
  parentCommentId?: string | null;
  creatorId: string;
  workspaceId: string;
  spaceId: string;
}

export interface DocumentCommentNotificationJob {
  commentId?: string;
  parentCommentId?: string | null;
  pageId: string;
  spaceId: string;
  workspaceId: string;
  actorId: string;
  mentionedUserIds: string[];
  notifyWatchers: boolean;
}

export interface PreparedDocumentCommentCreate {
  input: DocumentCreateCommentInput;
  insert: DocumentCommentInsert;
  addPageWatchersJob: {
    userIds: string[];
    pageId: string;
    spaceId: string;
    workspaceId: string;
  };
  notificationJob?: DocumentCommentNotificationJob;
  yjsMarkRequest?: {
    documentName: string;
    payload: {
      yjsSelection: unknown;
      commentId?: string;
      resolved: false;
      user: DocumentCommentUserRef;
    };
  };
  commentEvent: {
    operation: "commentCreated";
    pageId: string;
    comment?: unknown;
  };
  warnings: string[];
}

export interface DocumentExistingComment {
  id: string;
  creatorId: string;
  pageId: string;
  spaceId: string;
  workspaceId: string;
  content: unknown;
}

export interface PrepareDocumentCommentUpdateInput {
  comment: DocumentExistingComment;
  authUser: DocumentCommentUserRef;
  input: {
    content: string;
  };
  now?: Date;
}

export interface PreparedDocumentCommentUpdate {
  update: {
    content: unknown;
    editedAt: Date;
    updatedAt: Date;
  };
  notificationJob?: DocumentCommentNotificationJob;
  commentEvent: {
    operation: "commentUpdated";
    pageId: string;
    comment: DocumentExistingComment & {
      content: unknown;
      editedAt: Date;
      updatedAt: Date;
    };
  };
}

export function prepareDocumentCommentCreate(input: PrepareDocumentCommentCreateInput): PreparedDocumentCommentCreate {
  const commentContent = parseDocumentCommentContent(input.input.content);

  if (input.input.parentCommentId) {
    const parentComment = input.parentComment;
    if (!parentComment || parentComment.pageId !== input.page.id) {
      throw new DocumentCommentError("Parent comment not found");
    }
    if (parentComment.parentCommentId !== null && parentComment.parentCommentId !== undefined) {
      throw new DocumentCommentError("You cannot reply to a reply");
    }
  }

  const insert: DocumentCommentInsert = {
    pageId: input.page.id,
    content: commentContent,
    selection: input.input.selection?.substring(0, 250) ?? null,
    type: input.input.type ?? "page",
    parentCommentId: input.input.parentCommentId ?? undefined,
    creatorId: input.user.id,
    workspaceId: input.workspaceId,
    spaceId: input.page.spaceId,
  };

  const warnings: string[] = [];
  let yjsMarkRequest: PreparedDocumentCommentCreate["yjsMarkRequest"];
  if (input.input.yjsSelection) {
    const parsed = documentYjsSelectionSchema.safeParse(input.input.yjsSelection);
    if (!parsed.success) {
      warnings.push(`Invalid yjsSelection for comment ${input.insertedCommentId ?? "pending"}: ${parsed.error.message}`);
    } else {
      yjsMarkRequest = {
        documentName: `page.${input.page.id}`,
        payload: {
          yjsSelection: parsed.data,
          commentId: input.insertedCommentId,
          resolved: false,
          user: input.user,
        },
      };
    }
  }

  return {
    input: input.input,
    insert,
    addPageWatchersJob: {
      userIds: [input.user.id],
      pageId: input.page.id,
      spaceId: input.page.spaceId,
      workspaceId: input.workspaceId,
    },
    notificationJob: buildDocumentCommentNotificationJob({
      content: commentContent,
      oldMentionIds: [],
      commentId: input.insertedCommentId,
      pageId: input.page.id,
      spaceId: input.page.spaceId,
      workspaceId: input.workspaceId,
      actorId: input.user.id,
      notifyWatchers: !input.input.parentCommentId,
      parentCommentId: input.input.parentCommentId ?? undefined,
    }),...(yjsMarkRequest ? { yjsMarkRequest } : {}),
    commentEvent: {
      operation: "commentCreated",
      pageId: input.page.id,
    },
    warnings,
  };
}

export function prepareDocumentCommentUpdate(input: PrepareDocumentCommentUpdateInput): PreparedDocumentCommentUpdate {
  if (input.comment.creatorId !== input.authUser.id) {
    throw new DocumentCommentError("You can only edit your own comments");
  }

  const commentContent = parseDocumentCommentContent(input.input.content);
  const editedAt = input.now ?? new Date();
  const updatedComment = {...input.comment,
    content: commentContent,
    editedAt,
    updatedAt: editedAt,
  };

  return {
    update: {
      content: commentContent,
      editedAt,
      updatedAt: editedAt,
    },
    notificationJob: buildDocumentCommentNotificationJob({
      content: commentContent,
      oldMentionIds: extractDocumentMentionIds(input.comment.content),
      commentId: input.comment.id,
      pageId: input.comment.pageId,
      spaceId: input.comment.spaceId,
      workspaceId: input.comment.workspaceId,
      actorId: input.authUser.id,
      notifyWatchers: false,
    }),
    commentEvent: {
      operation: "commentUpdated",
      pageId: input.comment.pageId,
      comment: updatedComment,
    },
  };
}

export function canDeleteDocumentComment(input: {
  comment: Pick<DocumentExistingComment, "creatorId">;
  userId: string;
  canManageSpace: boolean;
}): boolean {
  return input.comment.creatorId === input.userId || input.canManageSpace;
}

export function parseDocumentCommentContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new DocumentCommentError(`Invalid comment content JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildDocumentCommentNotificationJob(input: {
  content: unknown;
  oldMentionIds: string[];
  commentId?: string;
  parentCommentId?: string | null;
  pageId: string;
  spaceId: string;
  workspaceId: string;
  actorId: string;
  notifyWatchers: boolean;
}): DocumentCommentNotificationJob | undefined {
  const mentionedUserIds = extractDocumentMentionIds(input.content);
  const newMentionIds = mentionedUserIds.filter((id) => id !== input.actorId && !input.oldMentionIds.includes(id));
  if (newMentionIds.length === 0 && !input.notifyWatchers && !input.parentCommentId) {
    return undefined;
  }

  return {
    commentId: input.commentId,
    parentCommentId: input.parentCommentId,
    pageId: input.pageId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    mentionedUserIds: newMentionIds,
    notifyWatchers: input.notifyWatchers,
  };
}

function extractDocumentMentionIds(content: unknown): string[] {
  const mentions = new Set<string>;
  visitJson(content, (value) => {
    if (!isObjectRecord(value)) return;
    const attrs = isObjectRecord(value["attrs"]) ? value["attrs"] : value;
    const id = attrs["id"] ?? attrs["userId"] ?? attrs["user_id"];
    const type = value["type"] ?? attrs["type"];
    if ((type === "mention" || type === "userMention" || attrs["label"]) && typeof id === "string") {
      mentions.add(id);
    }
  });
  return [...mentions];
}

function visitJson(value: unknown, visitor: (value: unknown) => void): void {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) visitJson(item, visitor);
    return;
  }
  if (isObjectRecord(value)) {
    for (const item of Object.values(value)) visitJson(item, visitor);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
