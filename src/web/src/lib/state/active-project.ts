import type { Cookies } from "@sveltejs/kit";

export const ACTIVE_PROJECT_COOKIE = "fulcrum_active_project";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

export function getActiveProject(cookies: Cookies): string | null {
  const raw = cookies.get(ACTIVE_PROJECT_COOKIE);
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!isValidSlug(trimmed)) return null;
  return trimmed;
}

export function setActiveProject(
  cookies: Cookies,
  slug: string | null,
): void {
  if (slug === null) {
    cookies.delete(ACTIVE_PROJECT_COOKIE, { path: "/" });
    return;
  }
  if (!isValidSlug(slug)) {
    throw new Error(`invalid project slug: ${slug}`);
  }
  cookies.set(ACTIVE_PROJECT_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearActiveProject(cookies: Cookies): void {
  setActiveProject(cookies, null);
}
