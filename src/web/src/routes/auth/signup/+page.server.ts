import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Resolve saas-auth flag — mirrors login/+page.server.ts.
 * Signup is a SaaS-only surface: accessible when flag ON, 403 when OFF.
 * D5: FULCRUM_FLAG_SAAS_AUTH env var override gates this route.
 */
function isSaasAuthEnabled(): boolean {
  return process.env["FULCRUM_FLAG_SAAS_AUTH"] === "true";
}

export const load: PageServerLoad = async () => {
  if (!isSaasAuthEnabled()) {
    throw error(403, "Sign-up requires saas-auth to be enabled");
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
