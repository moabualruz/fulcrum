import { fail } from "@sveltejs/kit";
import { AuthStore } from "@identity-access/infrastructure/database/auth-store.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const token = url.searchParams.get("token") ?? "";
  if (!token) return { status: "missing" };
  if (!locals.em) return { status: "unavailable" };

  try {
    const result = await new AuthStore(locals.em.connection).verifyEmail({ token });
    return { status: "verified", email: result.email };
  } catch (cause) {
    return { status: "invalid", message: messageFrom(cause) };
  }
};

export const actions: Actions = {
  resend: async ({ locals, request, url }) => {
    if (!locals.em) return fail(503, { resendError: "Email verification is unavailable." });

    const form = await request.formData();
    const orgId = String(form.get("orgId") ?? "");
    const userId = String(form.get("userId") ?? "");
    const email = String(form.get("email") ?? "");

    try {
      const result = await new AuthStore(locals.em.connection).requestEmailVerification({
        orgId,
        userId,
        email,
        baseUrl: url.origin,
      });
      return {
        resent: true,
        verificationUrl: result.verificationUrl,
        resendNotice: `Verification email sent to ${result.email}.`,
      };
    } catch (cause) {
      return fail(400, { resendError: messageFrom(cause), orgId, userId, email });
    }
  },
};

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
