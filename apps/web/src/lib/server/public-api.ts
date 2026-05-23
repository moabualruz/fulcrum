const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
// Seeded local admin UUID — matches the user the Better-Auth bypass resolves to in dev.
const DEFAULT_USER_ID = "ac09598f-ce28-4c3a-9ba0-262771456a19";

export function publicApiBaseUrl(url: URL): string {
  return (
    process.env["FULCRUM_SERVER_URL"] ??
    process.env["FULCRUM_PUBLIC_API_URL"] ??
    process.env["FULCRUM_API_URL"] ??
    `${url.protocol}//${url.host}`
  ).replace(/\/+$/, "");
}

export function activeOrgId(locals: App.Locals): string {
  const localOrgId = (locals as App.Locals & { orgId?: string | null }).orgId;
  return localOrgId && localOrgId.trim() ? localOrgId : DEFAULT_ORG_ID;
}

export function activeUserId(locals: App.Locals): string {
  const localUserId = (locals as App.Locals & { userId?: string | null }).userId;
  return localUserId && localUserId.trim() ? localUserId : DEFAULT_USER_ID;
}

export function cookieHeaders(request: Request): Record<string, string> {
  const cookie = request.headers.get("cookie");
  return cookie ? { cookie } : {};
}
