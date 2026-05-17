import type { JSONContent } from "@tiptap/core";

export interface QuickCreateApiScope {
  orgId?: string;
  userId?: string;
  projectId: string;
}

export interface QuickCreateTaskRow {
  id: string;
  title: string;
  projectId: string;
  status: string | null;
  priority: number | null;
}

export interface QuickCreateTemplateRow {
  id: string;
  name: string;
  templateData?: Record<string, unknown>;
  template_data?: Record<string, unknown>;
}

export interface QuickCreateTaskInput extends QuickCreateApiScope {
  title: string;
  status: string;
  description?: string;
  priority?: number;
  points?: number;
  assigneeId?: string;
  tiptapContent?: JSONContent;
}

type JsonRecord = Record<string, unknown>;

export async function findSimilarTasks(
  fetchFn: typeof fetch,
  input: QuickCreateApiScope & { title: string },
): Promise<QuickCreateTaskRow[]> {
  const title = input.title.trim().toLowerCase();
  if (!title) return [];
  const tasks = await listProjectTasks(fetchFn, input);
  return tasks
    .filter((task) => task.title.toLowerCase().includes(title))
    .slice(0, 8);
}

export async function listProjectTemplates(
  fetchFn: typeof fetch,
  input: QuickCreateApiScope,
): Promise<QuickCreateTemplateRow[]> {
  const scope = requireScope(input);
  const query = new URLSearchParams({
    orgId: scope.orgId,
    userId: scope.userId,
    projectId: input.projectId,
  });
  return await getPublicJson(fetchFn, `/api/v1/templates?${query.toString()}`);
}

export async function createQuickTask(
  fetchFn: typeof fetch,
  input: QuickCreateTaskInput,
): Promise<{ id: string }> {
  const scope = requireScope(input);
  const response = await fetchFn("/api/v1/tasks", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compact({
      orgId: scope.orgId,
      userId: scope.userId,
      projectId: input.projectId,
      title: input.title,
      status: input.status,
      description: input.description ?? null,
      descriptionText: input.description,
      priority: input.priority,
      points: input.points,
      assigneeId: input.assigneeId,
      tiptapContent: input.tiptapContent,
    })),
  });
  return await parsePublicResponse<{ id: string }>(response);
}

async function listProjectTasks(
  fetchFn: typeof fetch,
  input: QuickCreateApiScope,
): Promise<QuickCreateTaskRow[]> {
  const scope = requireScope(input);
  const query = new URLSearchParams({
    orgId: scope.orgId,
    userId: scope.userId,
    projectId: input.projectId,
  });
  return await getPublicJson(fetchFn, `/api/v1/tasks?${query.toString()}`);
}

async function getPublicJson<T>(fetchFn: typeof fetch, path: string): Promise<T> {
  const response = await fetchFn(path, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return await parsePublicResponse<T>(response);
}

async function parsePublicResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(extractPublicError(body, response.status));
  return body as T;
}

function requireScope(input: QuickCreateApiScope): Record<"orgId" | "userId", string> {
  const orgId = input.orgId?.trim();
  const userId = input.userId?.trim();
  if (!orgId || !userId) throw new Error("Organization and user scope are required.");
  if (!input.projectId.trim()) throw new Error("Project id is required.");
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

function extractPublicError(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Quick create request failed with ${status}.`;
}
