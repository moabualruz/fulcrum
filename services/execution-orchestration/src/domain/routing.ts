export enum RoutingRuleSource {
  Manual = "manual",
  Learned = "learned",
  Imported = "imported",
}

export const ROUTING_RULE_SOURCES = [
  RoutingRuleSource.Manual,
  RoutingRuleSource.Learned,
  RoutingRuleSource.Imported,
] as const;

export type RoutingConditions = Record<string, unknown>;
