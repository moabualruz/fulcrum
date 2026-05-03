import { evaluateRuleMatch } from "./rules-engine.ts";
import { recordRoutingEvent } from "./telemetry.ts";
import type { AutoAssignInput, RoutingDecision } from "./types.ts";

type RecordRoutingDecision = (event: {
  input: AutoAssignInput;
  decision: RoutingDecision;
}) => Promise<void> | void;

interface AutoAssignConfig {
  recordDecision?: RecordRoutingDecision | null;
}

let recordDecision: RecordRoutingDecision | null = null;

async function defaultRecordDecision({
  input,
  decision,
}: {
  input: AutoAssignInput;
  decision: RoutingDecision;
}): Promise<void> {
  if (!input.taskId) return;
  await recordRoutingEvent(decision, input.taskId, input.orgId, Boolean(input.dryRun));
}

recordDecision = defaultRecordDecision;

export function configureAutoAssign(config: AutoAssignConfig): void {
  recordDecision = config.recordDecision ?? defaultRecordDecision;
}

export async function autoAssign(
  input: AutoAssignInput,
): Promise<RoutingDecision | null> {
  const agentOverride = input.agentOverride?.trim();
  if (agentOverride) {
    return recordIfNeeded(input, {
      ruleId: null,
      source: "explicit",
      agent: agentOverride,
      confidence: 1.0,
    });
  }

  const match = await evaluateRuleMatch(input.taskFacts, input.orgId, input.projectId);
  if (!match) return null;

  return recordIfNeeded(input, {
    ruleId: match.ruleId,
    source: "rule",
    agent: match.agent,
    confidence: 1.0,
  });
}

async function recordIfNeeded(
  input: AutoAssignInput,
  decision: RoutingDecision,
): Promise<RoutingDecision> {
  if (!input.dryRun && recordDecision) {
    await recordDecision({ input, decision });
  }
  return decision;
}
