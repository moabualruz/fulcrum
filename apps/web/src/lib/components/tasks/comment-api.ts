import type { JSONContent } from "@tiptap/core";

export interface CommentApiScope {
  orgId?: string;
  userId?: string;
  taskId: string;
}

export interface CommentIdApiScope {
  orgId?: string;
  userId?: string;
  commentId: string;
}

export interface TaskCommentApiRow {
  id: string;
  orgId: string;
  taskId: string;
  authorId: string;
  body: JSONContent | null;
  parentCommentId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reactions: TaskCommentReactionApiRow[];
  replies?: TaskCommentApiRow[];
}

export interface TaskCommentReactionApiRow {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
  createdAt: string | null;
}

export interface TaskWatcherApiRow {
  id: string;
  taskId: string;
  userId: string;
  source: string;
  createdAt: string | null;
}

export interface OrganizationMemberApiRow {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

type JsonRecord = Record<string, unknown>;

export async function fetchTaskThreadedComments(
  fetchFn: typeof fetch,
  input: CommentApiScope,
): Promise<TaskCommentApiRow[]> {
  return await postPublicJson(fetchFn, "/api/v1/comments/threaded", requireTaskScope(input));
}

export async function createTaskComment(
  fetchFn: typeof fetch,
  input: CommentApiScope & { body: JSONContent; parentCommentId?: string | null },
): Promise<TaskCommentApiRow> {
  const { body, parentCommentId, ...scope } = input;
  return await postPublicJson(fetchFn, "/api/v1/comments/create", {
    ...requireTaskScope(scope),
    body,
    parentCommentId,
  });
}

export async function resolveTaskComment(
  fetchFn: typeof fetch,
  input: CommentIdApiScope,
): Promise<TaskCommentApiRow> {
  return await postPublicJson(fetchFn, "/api/v1/comments/resolve", requireCommentScope(input));
}

export async function unresolveTaskComment(
  fetchFn: typeof fetch,
  input: CommentIdApiScope,
): Promise<TaskCommentApiRow> {
  return await postPublicJson(fetchFn, "/api/v1/comments/unresolve", requireCommentScope(input));
}

export async function addTaskCommentReaction(
  fetchFn: typeof fetch,
  input: CommentIdApiScope & { emoji: string },
): Promise<TaskCommentReactionApiRow> {
  const { emoji, ...scope } = input;
  return await postPublicJson(fetchFn, "/api/v1/comments/add-reaction", {
    ...requireCommentScope(scope),
    emoji,
  });
}

export async function removeTaskCommentReaction(
  fetchFn: typeof fetch,
  input: CommentIdApiScope & { emoji: string },
): Promise<{ ok: true }> {
  const { emoji, ...scope } = input;
  return await postPublicJson(fetchFn, "/api/v1/comments/remove-reaction", {
    ...requireCommentScope(scope),
    emoji,
  });
}

export async function fetchTaskWatchers(
  fetchFn: typeof fetch,
  input: CommentApiScope,
): Promise<TaskWatcherApiRow[]> {
  return await postPublicJson(fetchFn, "/api/v1/comments/watchers", requireTaskScope(input));
}

export async function subscribeToTaskComments(
  fetchFn: typeof fetch,
  input: CommentApiScope,
): Promise<{ ok: true }> {
  return await postPublicJson(fetchFn, "/api/v1/comments/subscribe", requireTaskScope(input));
}

export async function unsubscribeFromTaskComments(
  fetchFn: typeof fetch,
  input: CommentApiScope,
): Promise<{ ok: true }> {
  return await postPublicJson(fetchFn, "/api/v1/comments/unsubscribe", requireTaskScope(input));
}

export async function fetchOrganizationMembers(
  fetchFn: typeof fetch,
  input: Omit<CommentApiScope, "taskId">,
): Promise<OrganizationMemberApiRow[]> {
  const scope = requireOrgUserScope(input);
  const params = new URLSearchParams(scope);
  const response = await fetchFn(`/api/v1/organizations/members?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return await parsePublicResponse<OrganizationMemberApiRow[]>(response, "Organization members request failed");
}

async function postPublicJson<T>(
  fetchFn: typeof fetch,
  path: string,
  body: JsonRecord,
): Promise<T> {
  const response = await fetchFn(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact(body)),
  });
  return await parsePublicResponse<T>(response, "Comment request failed");
}

async function parsePublicResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(extractPublicError(body, response.status, fallback));
  return body as T;
}

function requireTaskScope(input: CommentApiScope): JsonRecord {
  const scope = requireOrgUserScope(input);
  if (!input.taskId.trim()) throw new Error("Task id is required.");
  return { ...scope, taskId: input.taskId };
}

function requireCommentScope(input: CommentIdApiScope): JsonRecord {
  const scope = requireOrgUserScope(input);
  if (!input.commentId.trim()) throw new Error("Comment id is required.");
  return { ...scope, commentId: input.commentId };
}

function requireOrgUserScope(input: { orgId?: string; userId?: string }): Record<"orgId" | "userId", string> {
  const orgId = input.orgId?.trim();
  const userId = input.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  return { orgId, userId };
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractPublicError(body: unknown, status: number, fallback: string): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `${fallback} with ${status}.`;
}
