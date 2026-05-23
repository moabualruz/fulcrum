import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      return fail(400, { error: "Email and password are required." });
    }

    return {
      emailPasswordPost: JSON.stringify(
        { url: "+page.server", method: "POST", email, password: password ? "[masked]" : "" },
        null,
        2,
      ),
    };
  },
};
