/**
 * /settings/api — Public API settings page.
 *
 * Gated by FULCRUM_FEATURES=public-api (C1, default OFF).
 * Flag OFF → 404. Flag ON → shows base URL, copy-token, API key management.
 */

import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

function isPublicApiEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("public-api");
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }
  if (!isPublicApiEnabled()) {
    throw error(404, "Public API feature is not enabled");
  }

  const baseUrl = `${url.protocol}//${url.host}/api/v1`;
  return { baseUrl, apiKeys: [] as ApiKeyRow[] };
};

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
