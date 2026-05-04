import {
  loadRoutingPage,
  routingActions,
  type RoutingActionEvent,
  type RoutingLoadEvent,
} from "../../../settings/routing/routing.server";

function projectId(event: RoutingLoadEvent | RoutingActionEvent): string {
  return event.params?.id ?? "";
}

export async function load(event: RoutingLoadEvent) {
  return loadRoutingPage(event, projectId(event));
}

export const actions = routingActions(projectId);
