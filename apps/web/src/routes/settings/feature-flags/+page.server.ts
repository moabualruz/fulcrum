import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { createFeatureFlagsApiForEvent } from "$lib/server/feature-flags-api";

function appFail(error: unknown) {
  const message = error instanceof Error ? error.message : "Feature flag request failed";
  return fail(500, { error: message });
}

export const load: PageServerLoad = (event) => {
  return {
    streamed: {
      data: (async () => {
        const api = createFeatureFlagsApiForEvent(event);
        return await api.flags.settings.list();
      })(),
    },
  };
};

export const actions: Actions = {
  toggle: async (event) => {
    const data = await event.request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const api = createFeatureFlagsApiForEvent(event);
      return await api.flags.settings.toggle({ id });
    } catch (error) {
      return appFail(error);
    }
  },

  setRollout: async (event) => {
    const data = await event.request.formData();
    const id = data.get("id") as string;
    const pct = parseInt(data.get("rollout_percent") as string, 10);
    if (!id || isNaN(pct) || pct < 0 || pct > 100) return fail(400, { error: "invalid" });
    try {
      const api = createFeatureFlagsApiForEvent(event);
      return await api.flags.settings.setRollout({ id, rolloutPercent: pct });
    } catch (error) {
      return appFail(error);
    }
  },

  setCohortRules: async (event) => {
    const data = await event.request.formData();
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
      const api = createFeatureFlagsApiForEvent(event);
      return await api.flags.settings.setCohortRules({
        id,
        rules: rules && typeof rules === "object" && !Array.isArray(rules) ? rules as Record<string, unknown> : {},
      });
    } catch (error) {
      return appFail(error);
    }
  },
};
