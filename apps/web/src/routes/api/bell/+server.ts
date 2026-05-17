import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createNotificationApiCaller,
  NotificationApiError,
} from "@notification-center/interface/http/notification-api-client.ts";
import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

function unwrapCount(body: unknown): number {
  return Math.max(0, Number((body as { count?: unknown })?.count ?? 0));
}

function notificationScope(locals: App.Locals): { orgId: string; userId: string } | null {
  if (!locals.orgId || !locals.userId) return null;
  return { orgId: locals.orgId, userId: locals.userId };
}

export const GET: RequestHandler = async ({ fetch, locals, request, url }) => {
  const scope = notificationScope(locals);
  if (!scope) {
    return json({ error: "Notification scope is required." }, { status: 401 });
  }

  try {
    const api = createNotificationApiCaller({
      baseUrl: publicApiBaseUrl(url),
      orgId: scope.orgId,
      userId: scope.userId,
      fetch,
      headers: cookieHeaders(request),
    });
    const body = await api.notify.unreadCount();
    return json({ count: unwrapCount(body) });
  } catch (error) {
    const status = error instanceof NotificationApiError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Bell count request failed.";
    return json({ error: message }, { status });
  }
};
