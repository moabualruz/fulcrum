import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { isI18nEnabled, isValidLocale, setLocaleCookie, SUPPORTED_LOCALES } from "$lib/i18n/index.js";

export const load: PageServerLoad = async ({ locals }) => {
  if (!isI18nEnabled()) {
    redirect(302, "/");
  }

  return {
    locale: locals.locale,
    i18nEnabled: locals.i18nEnabled,
    supportedLocales: [...SUPPORTED_LOCALES],
  };
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    if (!isI18nEnabled()) {
      return fail(403, { error: "i18n feature not enabled" });
    }

    const data = await request.formData();
    const locale = data.get("locale");

    if (typeof locale !== "string" || !isValidLocale(locale)) {
      return fail(400, { error: "Invalid locale" });
    }

    setLocaleCookie(cookies, locale);

    return { success: true, locale };
  },
};
