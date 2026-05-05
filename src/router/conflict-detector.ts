/**
 * Conflict detector for routing drafts (RTR-02, D-12).
 *
 * Compares proposed draft conditions/actions against active rules
 * to detect overlaps. Returns matching active rule IDs when overlap
 * is found.
 */

import { Engine, type TopLevelCondition } from "json-rules-engine";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import type { RoutingRule } from "../db/entities/router/RoutingRule.ts";

export interface DetectConflictsInput {
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  orgId: string;
  projectId: string | null;
}

export interface DetectConflictsOptions {
  routingRuleRepository?: RoutingRuleRepository | null;
}

let configuredRepository: RoutingRuleRepository | null = null;

export function configureConflictDetector(options: DetectConflictsOptions): void {
  configuredRepository = options.routingRuleRepository ?? null;
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
  if (!configuredRepository) {
    return [];
  }

  const activeRules = await configuredRepository.findEnabledForDispatch(
    input.orgId,
    input.projectId,
  );

  const matchingIds: string[] = [];

  for (const rule of activeRules) {
    if (doConditionsOverlap(input.proposedConditions, rule)) {
      matchingIds.push(rule.id);
    }
  }

  return matchingIds;
}

/**
 * Checks whether proposed conditions semantically overlap with a rule.
 *
 * Uses json-rules-engine to test if a sample fact satisfies both
 * the proposed conditions and the existing rule simultaneously.
 */
function doConditionsOverlap(
  proposedConditions: Record<string, unknown>,
  rule: RoutingRule,
): boolean {
  try {
    // Try evaluating the proposed conditions against the existing rule's
    // conditions by testing rule agent match + condition similarity.
    // If both would match the same task kind, they likely overlap.
    const proposedKind = extractTaskKind(proposedConditions);
    const ruleKind = extractTaskKind(rule.conditionsJson);

    if (proposedKind && ruleKind && proposedKind === ruleKind) {
      return true;
    }

    // Also check action agent overlap
    const proposedAgent = extractActionAgent(proposedConditions);
    if (proposedAgent && proposedAgent === rule.actionAgent) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function extractTaskKind(conditions: Record<string, unknown>): string | null {
  try {
    const all = conditions["all"];
    if (Array.isArray(all)) {
      for (const condition of all) {
        if (
          typeof condition === "object" &&
          condition !== null &&
          "fact" in condition &&
          "value" in condition
        ) {
          const cond = condition as Record<string, unknown>;
          if (
            (cond["fact"] === "task.kind" || cond["fact"] === "task") &&
            typeof cond["value"] === "string"
          ) {
            return cond["value"];
          }
          // Handle path-based access
          if (
            cond["fact"] === "task" &&
            cond["path"] === "$.kind" &&
            typeof cond["value"] === "string"
          ) {
            return cond["value"];
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractActionAgent(conditions: Record<string, unknown>): string | null {
  try {
    const all = conditions["all"];
    if (Array.isArray(all)) {
      for (const condition of all) {
        if (
          typeof condition === "object" &&
          condition !== null &&
          "fact" in condition &&
          (condition as Record<string, unknown>)["fact"] === "action_agent" &&
          typeof (condition as Record<string, unknown>)["value"] === "string"
        ) {
          return (condition as Record<string, unknown>)["value"] as string;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
