import { error, type RequestHandler } from "@sveltejs/kit";
import { createAuditApiClient } from "@workflow-coordination/interface/http/audit-api-client";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const MAX_EXPORT_ROWS = 100_000;

export const GET: RequestHandler = async (event) => {
  const format = event.url.searchParams.get("format") === "json" ? "json" : "csv";
  const auditApi = createAuditApiClient({
    baseUrl: publicApiBaseUrl(event.url),
    orgId: activeOrgId(event.locals),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });

  try {
    const exported = await auditApi.export({
      projectId: queryValue(event.url, "project"),
      userId: queryValue(event.url, "actor"),
      kind: queryValue(event.url, "kind"),
      verb: queryValue(event.url, "verb"),
      since: queryValue(event.url, "since") ?? queryValue(event.url, "date_from"),
      until: queryValue(event.url, "until") ?? queryValue(event.url, "date_to"),
      limit: MAX_EXPORT_ROWS,
      offset: 0,
      format,
    });
    if ("jobId" in exported) {
      return Response.json(exported, { status: 202 });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    return new Response(exported.content, {
      headers: {
        "Content-Type": format === "json" ? "application/json" : "text/csv",
        "Content-Disposition": `attachment; filename="audit-${dateStr}.${format}"`,
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw error(502, message);
  }
};

function queryValue(url: URL, key: string): string | undefined {
  const value = (url.searchParams.get(key) ?? "").trim();
  return value || undefined;
}

function publicApiBaseUrl(url: URL): string {
  return (
    process.env["FULCRUM_SERVER_URL"] ??
    process.env["FULCRUM_PUBLIC_API_URL"] ??
    `${url.protocol}//${url.host}`
  ).replace(/\/+$/, "");
}

function activeOrgId(locals: App.Locals): string {
  const localOrgId = locals.orgId;
  return localOrgId && localOrgId.trim() ? localOrgId : DEFAULT_ORG_ID;
}

function cookieHeaders(request: Request): Record<string, string> {
  const cookie = request.headers.get("cookie");
  return cookie ? { cookie } : {};
}
