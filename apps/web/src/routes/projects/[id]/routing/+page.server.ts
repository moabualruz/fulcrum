import {
  loadRoutingPage,
  routingActions,
  type RoutingActionEvent,
  type RoutingLoadEvent,
} from "../../../settings/routing/routing.server";
import { ensureProjectExists } from "$lib/server/project-api";

function projectId(event: RoutingLoadEvent | RoutingActionEvent): string {
  return event.params?.id ?? "";
}

export async function load(event: RoutingLoadEvent) {
  await ensureProjectExists(event, projectId(event));
  return loadRoutingPage(event, projectId(event));
}

export const actions = routingActions(projectId);
