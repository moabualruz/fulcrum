import { loadRoutingPage, routingActions, type RoutingLoadEvent } from "./routing.server";

export async function load(event: RoutingLoadEvent) {
  return loadRoutingPage(event, null);
}

export const actions = routingActions();
