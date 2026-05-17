/**
 * Conflict detector for routing drafts (RTR-02, D-12).
 *
 * Compares proposed draft conditions/actions against active rules
 * to detect overlaps. Returns matching active rule IDs when overlap
 * is found.
 */

import {
  routingApplication,
  type RoutingApplication,
} from "@execution-orchestration/application/routing.ts";

type RoutingRuleStore = Parameters<
  RoutingApplication["detectRoutingConflicts"]
>[0]["routingRuleRepository"];

export interface DetectConflictsInput {
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  orgId: string;
  projectId: string | null;
}

export interface DetectConflictsOptions {
  routingRuleRepository?: RoutingRuleStore | null;
  application?: Pick<RoutingApplication, "detectRoutingConflicts"> | null;
}

let configuredRepository: RoutingRuleStore | null = null;
let application: Pick<RoutingApplication, "detectRoutingConflicts"> = routingApplication;

export function configureConflictDetector(options: DetectConflictsOptions): void {
  configuredRepository = options.routingRuleRepository ?? null;
  application = options.application ?? routingApplication;
}

/**
 * Detects conflicts by checking if proposed conditions/actions overlap
 * with any active routing rule for the same org.
 *
 * Returns an array of matching active rule IDs, or empty array if no overlap.
 */
export async function detectConflicts(
  input: DetectConflictsInput,
): Promise<string[]> {
  return application.detectRoutingConflicts(
    configuredRepository
      ? { ...input, routingRuleRepository: configuredRepository }
      : input,
  );
}
