import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import {
  setSettingsFeatureFlagCohortRules,
  setSettingsFeatureFlagRollout,
  toggleSettingsFeatureFlag,
} from "../../../../../application/settings/commands.ts";
import { listSettingsFeatureFlags } from "../../../../../application/settings/queries.ts";
import { AppError } from "../../../../../application/errors.ts";

function appFail(error: unknown) {
  if (error instanceof AppError) return fail(error.kind === "validation" ? 400 : 500, { error: error.message });
  throw error;
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return listSettingsFeatureFlags(em, ctx);
      })(),
    },
  };
};

export const actions: Actions = {
  toggle: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await toggleSettingsFeatureFlag(em, ctx, { id });
    } catch (error) {
      return appFail(error);
    }
  },

  setRollout: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const pct = parseInt(data.get("rollout_percent") as string, 10);
    if (!id || isNaN(pct) || pct < 0 || pct > 100) return fail(400, { error: "invalid" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await setSettingsFeatureFlagRollout(em, ctx, { id, rolloutPercent: pct });
    } catch (error) {
      return appFail(error);
    }
  },

  setCohortRules: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const rulesStr = data.get("cohort_rules") as string;
    if (!id) return fail(400, { error: "id required" });
    let rules: unknown;
    try {
      rules = JSON.parse(rulesStr || "{}");
    } catch {
      return fail(400, { error: "invalid JSON" });
    }
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await setSettingsFeatureFlagCohortRules(em, ctx, {
        id,
        rules: rules && typeof rules === "object" && !Array.isArray(rules) ? rules as Record<string, unknown> : {},
      });
    } catch (error) {
      return appFail(error);
    }
  },
};
