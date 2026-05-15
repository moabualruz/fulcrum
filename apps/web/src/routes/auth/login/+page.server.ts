import { fail, redirect } from "@sveltejs/kit";
import { isSaasAuthFeatureEnabled } from "@identity-access/application/auth/saas-auth-feature.ts";
import type { Actions, PageServerLoad } from "./$types";

export function _isSaasAuthEnabled(): boolean {
  return isSaasAuthFeatureEnabled();
}

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.session) {
    throw redirect(302, "/");
  }
  return { saasAuthEnabled: _isSaasAuthEnabled() };
};

export const actions: Actions = {
  default: async ({ fetch, request }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return fail(400, { error: "Invalid credentials", email });
    }

    throw redirect(302, "/");
  },
};
