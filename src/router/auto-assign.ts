import { evaluateRuleMatch } from "./rules-engine.ts";
import {
  learnRule as defaultLearnRule,
  promptForAgent as defaultPromptForAgent,
} from "./no-match-prompt.ts";
import { llmFallback } from "./llm-fallback.ts";
import { recordRoutingEvent } from "./telemetry.ts";
import type { AutoAssignInput, RoutingDecision, TaskFacts } from "./types.ts";

type RecordRoutingDecision = (event: {
  input: AutoAssignInput;
  decision: RoutingDecision;
}) => Promise<void> | void;

type PromptForAgent = (facts: TaskFacts) => Promise<string>;
type LearnRule = (
  facts: TaskFacts,
  agent: string,
  orgId: string,
  projectId?: string,
) => Promise<{ id: string; actionAgent: string }>;

interface AutoAssignConfig {
  recordDecision?: RecordRoutingDecision | null;
  // Injectable so CLI/TUI/Web can provide their own prompt surface while sharing rule learning.
  promptForAgent?: PromptForAgent | null;
  learnRule?: LearnRule | null;
}

let recordDecision: RecordRoutingDecision | null = null;
let promptForAgent: PromptForAgent = defaultPromptForAgent;
let learnRule: LearnRule = defaultLearnRule;

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
  promptForAgent = config.promptForAgent ?? defaultPromptForAgent;
  learnRule = config.learnRule ?? defaultLearnRule;
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
  if (!match) {
    if (input.dryRun) return null;

    // Tier 3: LLM fallback (gated by FULCRUM_FEATURES=router-llm)
    if (isRouterLlmEnabled()) {
      const llmResult = await llmFallback(input.taskFacts, input.orgId);
      if (llmResult) return recordIfNeeded(input, llmResult);
      // LLM returned null → fall through to interactive prompt
    }

    const agent = (await promptForAgent(input.taskFacts)).trim();
    if (!agent) return null;
    const rule = await learnRule(input.taskFacts, agent, input.orgId, input.projectId);
    return recordIfNeeded(input, {
      ruleId: rule.id,
      source: "learned",
      agent: rule.actionAgent,
      confidence: 1.0,
    });
  }

  return recordIfNeeded(input, {
    ruleId: match.ruleId,
    source: "rule",
    agent: match.agent,
    confidence: 1.0,
  });
}

function isRouterLlmEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((feature) => feature.trim().split(":")[0])
    .includes("router-llm");
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
