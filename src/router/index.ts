export {
  ROUTING_EVENT_VERB,
  RoutingEventPayloadSchema,
  type RoutingEventPayload,
} from "./routing-event-payload.ts";

export {
  autoAssign,
  configureAutoAssign,
} from "./auto-assign.ts";

export type {
  AutoAssignInput,
  RoutingDecision,
  RoutingDecisionSource,
} from "./types.ts";

export {
  configureRulesEngine,
  evaluateRuleMatch,
  evaluateRules,
  type TaskFacts,
} from "./rules-engine.ts";
