import type { PageServerLoad } from "./$types";
import { builtinTemplateRows } from "@knowledge-workspace/application/docs/template-seeds.ts";

export const load: PageServerLoad = async (event) => {
  const locals = (event as unknown as { locals?: Record<string, unknown> }).locals ?? {};
  const orgId = (locals["orgId"] as string | undefined) ?? "00000000-0000-0000-0000-000000000000";

  return {
    templates: builtinTemplateRows(orgId),
    projectId: null,
  };
};
