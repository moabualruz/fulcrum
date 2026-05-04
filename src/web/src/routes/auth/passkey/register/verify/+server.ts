import { json, type RequestHandler } from "@sveltejs/kit";

import { verifyRegistrationResponse } from "@fulcrum/auth/passkey.ts";
import { currentPasskeyUser, originFromUrl, passkeyError, rpIdFromUrl } from "../../shared.ts";

export const POST: RequestHandler = async ({ locals, request, url }) => {
  const user = await currentPasskeyUser(locals.session);
  if (user instanceof Response) return user;

  try {
    const response = await request.json() as Record<string, unknown>;
    const result = await verifyRegistrationResponse({
      userId: user.id,
      response,
      expectedOrigin: originFromUrl(url),
      rpId: rpIdFromUrl(url),
    });

    if (!result.verified) {
      return json({ verified: false, error: "Passkey registration failed" }, { status: 400 });
    }

    return json(result);
  } catch (error) {
    return passkeyError(error, "Could not verify passkey registration", 400);
  }
};
