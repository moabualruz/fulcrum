import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Resolve the saas-auth feature flag for the web login page.
 * Uses the same env-var override logic as AuthService.isSaasAuthEnabled().
 * DB check is intentionally skipped here to avoid wiring ORM at route load time;
 * the env var override is sufficient for SaaS deployment configuration.
 * D5: FULCRUM_FEATURES=saas-auth (or FULCRUM_FLAG_SAAS_AUTH=true) enables OAuth buttons.
 */
function isSaasAuthEnabled(): boolean {
  if (process.env["FULCRUM_FLAG_SAAS_AUTH"] === "true") return true;
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return features.includes("saas-auth");
}

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.session) {
    throw redirect(302, "/");
  }
  return { saasAuthEnabled: isSaasAuthEnabled() };
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
