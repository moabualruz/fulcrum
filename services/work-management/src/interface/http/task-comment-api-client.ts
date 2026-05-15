export interface TaskCommentApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface TaskCommentApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createTaskCommentApiCaller(options: TaskCommentApiClientOptions) {
  const request = taskCommentRequest(options);
  return {
    comments: {
      create: async (input: JsonRecord) =>
        await request("/api/v1/comments/create", { body: taskCommentBody(options, input) }),
      delete: async (input: JsonRecord) =>
        await request("/api/v1/comments/delete", { body: taskCommentBody(options, input) }),
      list: async (input: JsonRecord) =>
        await request("/api/v1/comments/list", { body: taskCommentBody(options, input) }),
      threaded: async (input: JsonRecord) =>
        await request("/api/v1/comments/threaded", { body: taskCommentBody(options, input) }),
      resolve: async (input: JsonRecord) =>
        await request("/api/v1/comments/resolve", { body: taskCommentBody(options, input) }),
      unresolve: async (input: JsonRecord) =>
        await request("/api/v1/comments/unresolve", { body: taskCommentBody(options, input) }),
      addReaction: async (input: JsonRecord) =>
        await request("/api/v1/comments/add-reaction", { body: taskCommentBody(options, input) }),
      removeReaction: async (input: JsonRecord) =>
        await request("/api/v1/comments/remove-reaction", { body: taskCommentBody(options, input) }),
      watchers: async (input: JsonRecord) =>
        await request("/api/v1/comments/watchers", { body: taskCommentBody(options, input) }),
      subscribe: async (input: JsonRecord) =>
        await request("/api/v1/comments/subscribe", { body: taskCommentBody(options, input) }),
      unsubscribe: async (input: JsonRecord) =>
        await request("/api/v1/comments/unsubscribe", { body: taskCommentBody(options, input) }),
    },
  };
}

export function createTaskCommentApiCallerFromEnv(
  env: TaskCommentApiEnvironment = process.env as unknown as TaskCommentApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createTaskCommentApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

function taskCommentRequest(options: TaskCommentApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    const response = await fetchFn(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function taskCommentBody(options: TaskCommentApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: options.orgId,
    userId: options.userId,
    ...input,
  });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Comment API request failed with ${status}.`;
}
