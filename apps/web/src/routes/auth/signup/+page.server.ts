import { error, fail, redirect } from "@sveltejs/kit";
import { isSaasAuthFeatureEnabled } from "@identity-access/interface/auth-feature.ts";
import { AuthStore } from "@identity-access/infrastructure/database/auth-store.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
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
  default: async ({ fetch, locals, request, url }) => {
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

    const body = await response.json().catch(() => null);
    const userId = readSignupUserId(body) ?? email;
    const orgId = readSignupOrgId(body) ?? DEFAULT_ORG_ID;
    const em = locals.em;
    if (!em) {
      return {
        created: true,
        email,
        verificationNotice: "Account created. Sign in after verifying your email address.",
      };
    }

    try {
      const verification = await new AuthStore(em.connection).requestEmailVerification({
        orgId,
        userId,
        email,
        baseUrl: url.origin,
      });
      return {
        created: true,
        email,
        verificationUrl: verification.verificationUrl,
        verificationNotice: `Verification email sent to ${verification.email}.`,
      };
    } catch (cause) {
      return fail(400, { error: authErrorMessage(cause), email, name });
    }
  },
};

function readSignupUserId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const user = record["user"];
  if (user && typeof user === "object" && typeof (user as { id?: unknown }).id === "string") {
    return (user as { id: string }).id;
  }
  return typeof record["userId"] === "string" ? record["userId"] : null;
}

function readSignupOrgId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const session = record["session"];
  if (session && typeof session === "object") {
    const scoped = session as { orgId?: unknown; activeOrganizationId?: unknown };
    if (typeof scoped.orgId === "string") return scoped.orgId;
    if (typeof scoped.activeOrganizationId === "string") return scoped.activeOrganizationId;
  }
  return typeof record["orgId"] === "string" ? record["orgId"] : null;
}
