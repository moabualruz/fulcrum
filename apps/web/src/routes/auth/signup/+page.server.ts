import { error, fail, redirect } from "@sveltejs/kit";
import { isSaasAuthFeatureEnabled } from "@identity-access/application/auth/saas-auth-feature.ts";
import type { Actions, PageServerLoad } from "./$types";

export function _isSaasAuthEnabled(): boolean {
  return isSaasAuthFeatureEnabled();
}

export const load: PageServerLoad = async () => {
  if (!_isSaasAuthEnabled()) {
    throw error(404, "Sign-up is not available");
  }
};

function authErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "Could not create account";
  }

  if ("message" in body && typeof body.message === "string") {
    return body.message;
  }

  if ("error" in body) {
    const error = body.error;
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return "Could not create account";
}

export const actions: Actions = {
  default: async ({ fetch, request }) => {
    if (!_isSaasAuthEnabled()) {
      throw error(404, "Sign-up is not available");
    }

    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");

    const response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return fail(400, { error: authErrorMessage(body), email, name });
    }

    throw redirect(302, "/");
  },
};
