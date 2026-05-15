import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import {
  addSettingsSecret,
  deleteSettingsSecret,
  rotateSettingsSecret,
  toggleSettingsSecretArchive,
} from "@platform-core/application/settings/commands.ts";
import { listSettingsSecrets } from "@platform-core/application/settings/queries.ts";
import { AppError } from "@platform-core/domain/errors.ts";

function appFail(error: unknown) {
  if (error instanceof AppError) return fail(error.kind === "validation" ? 400 : 500, { error: error.message });
  throw error;
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return listSettingsSecrets(em, ctx);
      })(),
    },
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    const data = await request.formData();
    const name = (data.get("name") as string)?.trim();
    const value = (data.get("value") as string)?.trim();
    const provider = (data.get("provider") as string)?.trim() ?? "";
    if (!name || !value) return fail(400, { error: "name and value required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await addSettingsSecret(em, ctx, { name, value, provider });
    } catch (error) {
      return appFail(error);
    }
  },

  rotate: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const value = (data.get("value") as string)?.trim();
    if (!id || !value) return fail(400, { error: "id and value required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await rotateSettingsSecret(em, ctx, { id, value });
    } catch (error) {
      return appFail(error);
    }
  },

  archive: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await toggleSettingsSecretArchive(em, ctx, { id });
    } catch (error) {
      return appFail(error);
    }
  },

  delete: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await deleteSettingsSecret(em, ctx, { id });
    } catch (error) {
      return appFail(error);
    }
  },
};
