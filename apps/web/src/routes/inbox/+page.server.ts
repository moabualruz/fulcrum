import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { createNotificationApiCaller } from "@notification-center/interface/http/notification-api-client.ts";
import { createAuditApiClient } from "@workflow-coordination/interface/http/audit-api-client.ts";
import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

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
  evidenceHref: string;
  evidenceLabel: string;
}

export interface NotificationRuleRow {
  id: string;
  name: string;
  enabled: boolean;
  channels: string[];
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
  notificationRules: NotificationRuleRow[];
  unreadCount: number;
  activity: ActivityRow[];
  activityPage: number;
  activityTotal: number;
}

const PAGE_SIZE = 20;

function notificationApi(event: SessionEvent) {
  if (!event.locals.orgId || !event.locals.userId) return null;
  return createNotificationApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: event.locals.orgId,
    userId: event.locals.userId,
    fetch: event.fetch,
    headers: cookieHeaders(event.request as Request),
  }).notify;
}

function auditApi(event: SessionEvent) {
  if (!event.locals.orgId || !event.locals.userId) return null;
  return createAuditApiClient({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: event.locals.orgId,
    fetch: event.fetch,
    headers: cookieHeaders(event.request as Request),
  });
}

function normalizeNotification(row: Record<string, unknown>): NotificationRow {
  const entityKind = String(row["entityKind"] ?? "event");
  const entityId = String(row["entityId"] ?? row["eventId"] ?? "");
  return {
    id: String(row["id"]),
    orgId: String(row["orgId"]),
    userId: String(row["userId"]),
    ruleId: row["ruleId"] === null ? null : String(row["ruleId"]),
    eventId: String(row["eventId"]),
    title: String(row["title"] ?? ""),
    body: String(row["body"] ?? ""),
    entityKind,
    entityId,
    read: row["read"] === true,
    readAt: row["readAt"] ? String(row["readAt"]) : null,
    createdAt: String(row["createdAt"]),
    evidenceHref: `/search?q=${encodeURIComponent(`${entityKind}:${entityId}`)}`,
    evidenceLabel: `${entityKind}:${entityId}`,
  };
}

function normalizeNotificationRule(row: Record<string, unknown>): NotificationRuleRow {
  return {
    id: String(row["id"]),
    name: String(row["name"] ?? "Unnamed rule"),
    enabled: row["enabled"] !== false,
    channels: Array.isArray(row["channels"]) ? row["channels"].map(String) : [],
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
  const notify = notificationApi(sessionEvent);
  const audit = auditApi(sessionEvent);
  if (!notify) throw new Error("Notification scope is required.");
  if (!audit) throw new Error("Audit scope is required.");

  const [unreadResult, listResult, activityResult] = await Promise.all([
    notify.unreadCount().catch(() => ({ count: 0 })),
    notify.list().catch(() => []),
    audit.queryPage({
      userId: sessionEvent.locals.userId ?? undefined,
      limit: PAGE_SIZE,
      offset: (activityPage - 1) * PAGE_SIZE,
    }).catch(() => ({ data: [], total: 0 })),
  ]);
  const rulesResult = await notify.rules.list().catch(() => []);

  const count = Number((unreadResult as { count?: unknown })?.count ?? 0);
  const items = Array.isArray(listResult)
    ? (listResult as Record<string, unknown>[])
    : [];
  const activityItems = Array.isArray(activityResult.data)
    ? (activityResult.data as Record<string, unknown>[])
    : [];
  const activityTotal = Number((activityResult as { total?: unknown })?.total ?? activityItems.length);

  return {
    notifications: items.map(normalizeNotification),
    notificationRules: Array.isArray(rulesResult)
      ? (rulesResult as Record<string, unknown>[]).map(normalizeNotificationRule)
      : [],
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
    const notify = notificationApi(actionEvent);
    if (!notify) throw new Error("Notification scope is required.");
    await notify.markAllRead();
    return { markedRead: true };
  },
  markRead: async (event) => {
    const actionEvent = event as ActionEvent;
    if (!actionEvent.locals.session) throw redirect(302, "/auth/login");
    const notify = notificationApi(actionEvent);
    if (!notify) throw new Error("Notification scope is required.");
    const form = await actionEvent.request.formData();
    const id = String(form.get("id") ?? "");
    if (!id) return { markedRead: false };
    await notify.markRead({ id });
    return { markedRead: true, id };
  },
};
