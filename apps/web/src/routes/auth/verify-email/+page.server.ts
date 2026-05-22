import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createAuthApiForEvent } from "$lib/server/auth-api";

export const load: PageServerLoad = async (event) => {
  const { url } = event;
  const token = url.searchParams.get("token") ?? "";
  if (!token) return { status: "missing" };

  try {
    const result = await createAuthApiForEvent(event).auth.verifyEmail({ token }) as { email?: string };
    return { status: "verified", email: result.email };
  } catch (cause) {
    return { status: "invalid", message: messageFrom(cause) };
  }
};

export const actions: Actions = {
  resend: async (event) => {
    const { request, url } = event;
    const form = await request.formData();
    const orgId = String(form.get("orgId") ?? "");
    const userId = String(form.get("userId") ?? "");
    const email = String(form.get("email") ?? "");

    try {
      const result = await createAuthApiForEvent(event).auth.requestEmailVerification({
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
