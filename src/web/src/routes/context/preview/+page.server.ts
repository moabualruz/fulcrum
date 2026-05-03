import type { PageServerLoad } from "./$types";

type ContextSlice = {
  tokenCount: number;
  content: string;
};

type ContextPreviewPayload = {
  bundle: {
    taskId?: string;
    tokenBudget: number;
    tokenCount: number;
    slices: Record<string, ContextSlice | undefined>;
  };
  snapshotId?: string | null;
};

function unwrapTrpcJson<T>(payload: unknown): T {
  const wrapped = payload as {
    result?: { data?: { json?: T } | T };
    json?: T;
  };
  const data = wrapped.result?.data;
  if (data && typeof data === "object" && "json" in data) return data.json as T;
  if (data !== undefined) return data as T;
  if (wrapped.json !== undefined) return wrapped.json;
  return payload as T;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const taskId = url.searchParams.get("task")?.trim() || null;
  if (!taskId) {
    return {
      taskId,
      preview: null,
      errorMessage: "Add ?task=<id> to preview assembled context.",
    };
  }

  try {
    const response = await fetch("/api/trpc/context.preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { taskId } }),
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    return {
      taskId,
      preview: unwrapTrpcJson<ContextPreviewPayload>(payload),
      errorMessage: null,
    };
  } catch (error) {
    return {
      taskId,
      preview: null,
      errorMessage: error instanceof Error ? error.message : "Context preview failed.",
    };
  }
};
