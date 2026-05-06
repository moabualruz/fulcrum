/**
 * Conflict detector for routing drafts (RTR-02, D-12).
 *
 * Compares proposed draft conditions/actions against active rules
 * to detect overlaps. Returns matching active rule IDs when overlap
 * is found.
 */

import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import {
  routingApplication,
  type RoutingApplication,
} from "../application/routing.ts";

export interface DetectConflictsInput {
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  orgId: string;
  projectId: string | null;
}

export interface DetectConflictsOptions {
  routingRuleRepository?: RoutingRuleRepository | null;
  application?: Pick<RoutingApplication, "detectRoutingConflicts"> | null;
}

let configuredRepository: RoutingRuleRepository | null = null;
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
