/**
 * /settings/api — Public API settings page.
 *
 * Gated by FULCRUM_FEATURES=public-api (C1, default OFF).
 * Flag OFF → 404. Flag ON → shows base URL, copy-token, API key management.
 */

import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { isPublicApiEnabled } from "@fulcrum/server/api/feature-flags.ts";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }
  if (!isPublicApiEnabled()) {
    throw error(404, "Public API feature is not enabled");
  }

  const baseUrl = `${url.protocol}//${url.host}/api/v1`;
  return {
    baseUrl,
    openApiUrl: `${baseUrl}/openapi.json`,
    apiKeys: [] as ApiKeyRow[],
    rateLimit: {
      enabled: true,
      policy: "per API key / org identity",
      limit: 120,
      windowSeconds: 60,
    },
  };
};

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
