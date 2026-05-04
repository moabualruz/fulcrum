/**
 * /settings/billing — placeholder billing settings page.
 *
 * Gated by FULCRUM_FEATURES=saas-auth (C1, default OFF).
 * Flag OFF → hidden from nav; direct navigation returns 404.
 * Flag ON → renders billing placeholder card.
 */

import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

function isSaasAuthEnabled(): boolean {
  if (process.env["FULCRUM_FLAG_SAAS_AUTH"] === "true") return true;
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("saas-auth");
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw redirect(302, "/auth/login");
  }
  if (!isSaasAuthEnabled()) {
    throw error(404, "Billing settings require saas-auth to be enabled");
  }
  return { billingEnabled: true };
};
