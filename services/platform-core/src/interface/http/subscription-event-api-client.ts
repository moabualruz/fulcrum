export interface SubscriptionEventApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
  FULCRUM_USER_ID?: string;
}

export interface SubscriptionEventApiClientOptions {
  baseUrl: string;
  orgId: string;
  userId: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface SubscriptionEventStreamInput {
  signal?: AbortSignal;
  onEvent(event: SerializedSubscriptionEvent): void;
}

type JsonRecord = Record<string, unknown>;

export function createSubscriptionEventApiCaller(options: SubscriptionEventApiClientOptions) {
  return {
    runsSubscriptions: {
      onRunUpdate: async (input: SubscriptionEventStreamInput & { runId: string }) =>
        await streamEvents(options, "/api/v1/events/runs", {
          query: scopedQuery(options, { runId: input.runId }),
          signal: input.signal,
          onEvent: input.onEvent,
        }),
    },
    orchestrationSubscriptions: {
      onStateChange: async (input: SubscriptionEventStreamInput) =>
        await streamEvents(options, "/api/v1/events/orchestration", {
          query: scopedQuery(options, {}),
          signal: input.signal,
          onEvent: input.onEvent,
        }),
    },
    notifySubscriptions: {
      onNewNotification: async (input: SubscriptionEventStreamInput) =>
        await streamEvents(options, "/api/v1/events/notifications", {
          query: scopedQuery(options, {}),
          signal: input.signal,
          onEvent: input.onEvent,
        }),
    },
  };
}

export function createSubscriptionEventApiCallerFromEnv(
  env: SubscriptionEventApiEnvironment = process.env as unknown as SubscriptionEventApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  const orgId = env.FULCRUM_ORG_ID;
  const userId = env.FULCRUM_USER_ID;
  if (!baseUrl || !orgId || !userId) return null;
  return createSubscriptionEventApiCaller({ baseUrl, orgId, userId, fetch: fetchFn });
}

async function streamEvents(
  options: SubscriptionEventApiClientOptions,
  path: string,
  input: SubscriptionEventStreamInput & { query: JsonRecord },
): Promise<void> {
  const url = new URL(path, options.baseUrl.replace(/\/+$/, ""));
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await (options.fetch ?? fetch)(url.toString(), {
    method: "GET",
    signal: input.signal,
    credentials: "include",
    headers: {
      accept: "text/event-stream",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new Error(extractErrorMessage(body, response.status));
  }
  if (!response.body) throw new Error("Subscription event stream response did not include a body.");

  await readEventStream(response.body, input.onEvent);
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SerializedSubscriptionEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? "";
    for (const part of parts) emitEventBlock(part, onEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) emitEventBlock(buffer, onEvent);
}

function emitEventBlock(block: string, onEvent: (event: SerializedSubscriptionEvent) => void): void {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data) return;
  onEvent(JSON.parse(data) as SerializedSubscriptionEvent);
}

function scopedQuery(options: SubscriptionEventApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({ orgId: options.orgId, userId: options.userId, ...input });
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
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
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Subscription event API request failed with ${status}.`;
}
import type { SerializedSubscriptionEvent } from "@platform-core/application/subscriptions/event-bus.ts";
