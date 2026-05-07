import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";

interface SessionEvent {
  locals: { session?: unknown };
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface ActionEvent extends SessionEvent {
  request: SessionEvent["request"] & { formData(): Promise<FormData> };
}

export interface NotificationRow {
  id: string;
  orgId: string;
  userId: string;
  ruleId: string | null;
  eventId: string;
  title: string;
  body: string;
  entityKind: string;
  entityId: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface InboxData {
  notifications: NotificationRow[];
  unreadCount: number;
  activity: ActivityRow[];
  activityPage: number;
  activityTotal: number;
}

const PAGE_SIZE = 20;

function baseUrl(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function unwrapTrpcData(body: unknown): unknown {
  return (
    (body as { result?: { data?: { json?: unknown } } })?.result?.data?.json ??
    (body as { result?: { data?: unknown } })?.result?.data ??
    body
  );
}

function extractTrpcError(body: unknown): string {
  const error = (body as { error?: { json?: { message?: string }; message?: string } })?.error;
  return error?.json?.message ?? error?.message ?? "Request failed";
}

async function trpcQuery(event: SessionEvent, procedure: string, input: unknown): Promise<unknown> {
  const encodedInput = encodeURIComponent(JSON.stringify(input));
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}?input=${encodedInput}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

async function trpcMutation(event: ActionEvent, procedure: string, input: unknown): Promise<unknown> {
  const response = await event.fetch(`${baseUrl(event.url)}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

function normalizeNotification(row: Record<string, unknown>): NotificationRow {
  return {
    id: String(row["id"]),
    orgId: String(row["orgId"]),
    userId: String(row["userId"]),
    ruleId: row["ruleId"] === null ? null : String(row["ruleId"]),
    eventId: String(row["eventId"]),
    title: String(row["title"] ?? ""),
    body: String(row["body"] ?? ""),
    entityKind: String(row["entityKind"] ?? "event"),
    entityId: String(row["entityId"] ?? row["eventId"] ?? ""),
    read: row["read"] === true,
    readAt: row["readAt"] ? String(row["readAt"]) : null,
    createdAt: String(row["createdAt"]),
  };
}

export const load: ServerLoad = async (event) => {
  const sessionEvent = event as SessionEvent;
  if (!sessionEvent.locals.session) throw redirect(302, "/auth/login");

  const activityPageRaw = parseInt(sessionEvent.url.searchParams.get("activity_page") ?? "1", 10);
  const activityPage = Number.isNaN(activityPageRaw) || activityPageRaw < 1 ? 1 : activityPageRaw;

  const [unreadResult, listResult] = await Promise.all([
    trpcQuery(sessionEvent, "notify.unreadCount", {}),
    trpcQuery(sessionEvent, "notify.list", { limit: 50, offset: 0 }),
  ]);

  const count = Number((unreadResult as { count?: unknown })?.count ?? 0);
  const items = Array.isArray((listResult as { items?: unknown })?.items)
    ? ((listResult as { items: Record<string, unknown>[] }).items)
    : [];

  return {
    notifications: items.map(normalizeNotification),
    unreadCount: Math.max(0, count),
    activity: [],
    activityPage,
    activityTotal: 0,
  } satisfies InboxData;
};

export const actions: Actions = {
  markAllRead: async (event) => {
    const actionEvent = event as ActionEvent;
    if (!actionEvent.locals.session) throw redirect(302, "/auth/login");
    await trpcMutation(actionEvent, "notify.markAllRead", {});
    return { markedRead: true };
  },
};
