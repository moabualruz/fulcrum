import { json, type RequestHandler } from "@sveltejs/kit";

import { generateAuthenticationOptions } from "../../../../../../../auth/passkey.ts";
import { passkeyError, rpIdFromUrl, setLoginChallengeCookie } from "../../shared.ts";

export const POST: RequestHandler = async ({ cookies, url }) => {
  const challengeId = crypto.randomUUID();

  try {
    const options = await generateAuthenticationOptions({
      challengeId,
      rpId: rpIdFromUrl(url),
    });
    setLoginChallengeCookie(cookies, challengeId, url.protocol === "https:");
    return json(options);
  } catch (error) {
    return passkeyError(error, "Could not start passkey login", 400);
  }
};
