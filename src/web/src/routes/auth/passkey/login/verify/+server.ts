import { json, type RequestHandler } from "@sveltejs/kit";

import { verifyAuthenticationResponse } from "@fulcrum/auth/passkey.ts";
import {
  clearLoginChallengeCookie,
  originFromUrl,
  passkeyError,
  PASSKEY_LOGIN_CHALLENGE_COOKIE,
  rpIdFromUrl,
  setBetterAuthSessionCookie,
} from "../../shared.ts";

export const POST: RequestHandler = async ({ cookies, request, url }) => {
  const challengeId = cookies.get(PASSKEY_LOGIN_CHALLENGE_COOKIE);
  if (!challengeId) {
    return json({ verified: false, error: "Passkey challenge missing" }, { status: 400 });
  }

  try {
    const response = await request.json() as Record<string, unknown>;
    const result = await verifyAuthenticationResponse({
      response,
      expectedOrigin: originFromUrl(url),
      rpId: rpIdFromUrl(url),
      challengeId,
    });

    if (!result.verified || !result.userId) {
      return json({ verified: false, error: "Passkey login failed" }, { status: 401 });
    }

    await setBetterAuthSessionCookie(cookies, url, result.userId);
    clearLoginChallengeCookie(cookies, url.protocol === "https:");
    return json(result);
  } catch (error) {
    return passkeyError(error, "Could not verify passkey login", 400);
  }
};
