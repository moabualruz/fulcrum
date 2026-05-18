import {
  loadRoutingPage,
  routingActions,
  type RoutingActionEvent,
  type RoutingLoadEvent,
} from "../../../settings/routing/routing.server";
import { error } from "@sveltejs/kit";
import { loadProjectOverview } from "@work-management/interface/project-lifecycle.ts";

function projectId(event: RoutingLoadEvent | RoutingActionEvent): string {
  return event.params?.id ?? "";
}

export async function load(event: RoutingLoadEvent) {
  await ensureProject(event, projectId(event));
  return loadRoutingPage(event, projectId(event));
}

export const actions = routingActions(projectId);

async function ensureProject(event: RoutingLoadEvent, id: string): Promise<void> {
  const { requestServiceScope } = await import("$lib/server/request-service-scope");
  const { em, ctx } = await requestServiceScope(event.locals as App.Locals, id);
  const project = await loadProjectOverview(em, ctx, id);
  if (!project) throw error(404, "Project not found");
}
