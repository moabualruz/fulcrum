import { redirect } from "@sveltejs/kit";

import { normalizeLocale } from "$lib/i18n/index.ts";

export async function POST({ locals, request }: { locals: App.Locals; request: Request }): Promise<Response> {
  const form = await request.formData();
  const locale = normalizeLocale(String(form.get("locale") ?? ""));
  const repo = resolveTenantSettings(locals.container);
  await repo?.upsertValue?.("web.locale", locale);
  throw redirect(303, request.headers.get("referer") ?? "/");
}

function resolveTenantSettings(container: App.Locals["container"]):
  | { upsertValue?: (key: string, value: string) => Promise<unknown> }
  | null {
  try {
    return container?.get("TenantSettingRepository") as
      | { upsertValue?: (key: string, value: string) => Promise<unknown> }
      | undefined ?? null;
  } catch {
    return null;
  }
}
