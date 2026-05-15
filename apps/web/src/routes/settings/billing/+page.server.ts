/**
 * /settings/billing — placeholder billing settings page.
 *
 * Gated by the SaaS-auth feature flag.
 * Flag OFF → hidden from nav; direct navigation returns 404.
 * Flag ON → renders billing placeholder card.
 */

import { error, redirect } from "@sveltejs/kit";
import { isSaasAuthFeatureEnabled } from "@identity-access/interface/auth-feature.ts";
import type { PageServerLoad } from "./$types";

export function _isSaasAuthEnabled(): boolean {
  return isSaasAuthFeatureEnabled();
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }
  if (!_isSaasAuthEnabled()) {
    throw error(404, "Billing settings require saas-auth to be enabled");
  }
  return { billingEnabled: true };
};
