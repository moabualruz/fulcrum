import type { Actions, ServerLoad } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { purgeSettingsTelemetry, toggleSettingsTelemetryOptIn } from "@/application/settings/commands.ts";
import { getSettingsTelemetry } from "@/application/settings/queries.ts";

export const load: ServerLoad = ({ locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return getSettingsTelemetry(em, ctx);
      })(),
    },
  };
};

export const actions: Actions = {
  toggleOptIn: async ({ locals }) => {
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    return await toggleSettingsTelemetryOptIn(em, ctx);
  },

  purge: async ({ locals }) => {
    const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
    return await purgeSettingsTelemetry(em, ctx);
  },
};
