import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    return {
      emailPasswordPost: JSON.stringify(
        { url: "+page.server", method: "POST", email, password: password ? "[masked]" : "" },
        null,
        2,
      ),
    };
  },
};
