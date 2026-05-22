import { error } from "@sveltejs/kit";

export async function requestProjectScope(_locals: App.Locals, _projectId?: string | null): Promise<never> {
  throw error(410, "Project pages must use public API web clients; in-process project scope is retired.");
}
