import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";

interface SessionEvent {
  locals: { session?: unknown; orgId?: string | null; userId?: string | null };
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

function extractApiError(body: unknown): string {
  const record = body as { error?: { message?: string }; message?: string } | null;
  return record?.error?.message ?? record?.message ?? "Request failed";
}

function publicApiBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env["FULCRUM_SERVER_URL"] ?? env["FULCRUM_PUBLIC_API_URL"];
  return raw ? raw.replace(/\/+$/, "") : null;
}

function publicNotificationUrl(event: SessionEvent, path: string): string | null {
  if (!event.locals.orgId || !event.locals.userId) return null;
  const base = publicApiBaseUrl() ?? baseUrl(event.url);
  const url = new URL(path, base);
  url.searchParams.set("orgId", event.locals.orgId);
  url.searchParams.set("userId", event.locals.userId);
  return url.toString();
}

function publicAuditUrl(event: SessionEvent, activityPage: number): string | null {
  if (!event.locals.orgId || !event.locals.userId) return null;
  const base = publicApiBaseUrl() ?? baseUrl(event.url);
  const url = new URL("/api/v1/audit", base);
  url.searchParams.set("orgId", event.locals.orgId);
  url.searchParams.set("userId", event.locals.userId);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String((activityPage - 1) * PAGE_SIZE));
  return url.toString();
}

async function publicNotificationRequest(
  event: SessionEvent,
  path: string,
  method: "GET" | "PATCH" = "GET",
): Promise<unknown> {
  const target = publicNotificationUrl(event, path);
  if (!target) throw new Error("Notification scope is required.");
  const response = await event.fetch(target, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(body));
  return body;
}

async function publicAuditRequest(event: SessionEvent, activityPage: number): Promise<unknown> {
  const target = publicAuditUrl(event, activityPage);
  if (!target) throw new Error("Audit scope is required.");
  const response = await event.fetch(target, {
    method: "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      cookie: event.request.headers.get("cookie") ?? "",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(body));
  return body;
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

function normalizeActivity(row: Record<string, unknown>): ActivityRow {
  return {
    id: String(row["id"]),
    org_id: String(row["orgId"]),
    project_id: row["projectId"] ? String(row["projectId"]) : null,
    actor: String(row["userId"] ?? "system"),
    subject_kind: String(row["subjectKind"] ?? "event"),
    subject_id: String(row["subjectId"] ?? ""),
    verb: String(row["verb"] ?? ""),
    payload: isRecord(row["payload"]) ? row["payload"] : {},
    created_at: String(row["createdAt"]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const load: ServerLoad = async (event) => {
  const sessionEvent = event as SessionEvent;
  if (!sessionEvent.locals.session) throw redirect(302, "/auth/login");

  const activityPageRaw = parseInt(sessionEvent.url.searchParams.get("activity_page") ?? "1", 10);
  const activityPage = Number.isNaN(activityPageRaw) || activityPageRaw < 1 ? 1 : activityPageRaw;

  const [unreadResult, listResult, activityResult] = await Promise.all([
    publicNotificationRequest(sessionEvent, "/api/v1/notifications/unread-count"),
    publicNotificationRequest(sessionEvent, "/api/v1/notifications"),
    publicAuditRequest(sessionEvent, activityPage),
  ]);

  const count = Number((unreadResult as { count?: unknown })?.count ?? 0);
  const items = Array.isArray((listResult as { data?: unknown })?.data)
    ? ((listResult as { data: Record<string, unknown>[] }).data)
    : Array.isArray((listResult as { items?: unknown })?.items)
    ? ((listResult as { items: Record<string, unknown>[] }).items)
    : [];
  const activityItems = Array.isArray((activityResult as { data?: unknown })?.data)
    ? ((activityResult as { data: Record<string, unknown>[] }).data)
    : [];
  const activityTotal = Number((activityResult as { total?: unknown })?.total ?? activityItems.length);

  return {
    notifications: items.map(normalizeNotification),
    unreadCount: Math.max(0, count),
    activity: activityItems.map(normalizeActivity),
    activityPage,
    activityTotal: Math.max(0, activityTotal),
  } satisfies InboxData;
};

export const actions: Actions = {
  markAllRead: async (event) => {
    const actionEvent = event as ActionEvent;
    if (!actionEvent.locals.session) throw redirect(302, "/auth/login");
    await publicNotificationRequest(actionEvent, "/api/v1/notifications/mark-all-read", "PATCH");
    return { markedRead: true };
  },
};
