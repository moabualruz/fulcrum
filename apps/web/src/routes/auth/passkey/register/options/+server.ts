import { json, type RequestHandler } from "@sveltejs/kit";

import { generateRegistrationOptions } from "../../../../../../../auth/passkey.ts";
import { currentPasskeyUser, passkeyError, rpIdFromUrl } from "../../shared.ts";

export const POST: RequestHandler = async ({ locals, url }) => {
  const user = await currentPasskeyUser(locals.session);
  if (user instanceof Response) return user;

  try {
    const options = await generateRegistrationOptions({
      user,
      rpId: rpIdFromUrl(url),
    });
    return json(options);
  } catch (error) {
    return passkeyError(error, "Could not start passkey registration", 400);
  }
};
