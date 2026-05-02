/**
 * auto-assign.ts — three-tier task routing orchestrator.
 *
 * Tier 1: agentOverride (explicit)
 * Tier 2: rules-engine (deterministic rules, includes learned rules)
 * Tier 3 (gated by FULCRUM_FEATURES=router-llm): LLM fallback — NOT in this module.
 *
 * When Tier 1 + Tier 2 both return null AND router-llm is OFF, fires the injectable
 * promptForAgent and stores the answer as a learned rule via learnRule.
 *
 * C1: router-llm gate checked via FULCRUM_FEATURES env var.
 * C4: promptForAgent is injectable — TUI/Web surfaces can substitute their own UI.
 */

import { evaluateRuleMatch } from "./rules-engine.ts";
import { promptForAgent as defaultPrompt, learnRule } from "./no-match-prompt.ts";
import type { AutoAssignInput, RoutingDecision, TaskFacts } from "./types.ts";

// ─── injectable surface ───────────────────────────────────────────────────────

type PromptFn = (facts: TaskFacts) => Promise<string>;
type RecordFn = (event: { input: AutoAssignInput; decision: RoutingDecision }) => Promise<void> | void;

interface AutoAssignConfig {
  promptForAgent?: PromptFn | null;
  recordDecision?: RecordFn | null;
}

let promptFn: PromptFn | null = null;
let recordFn: RecordFn | null = null;

export function configureAutoAssign(config: AutoAssignConfig): void {
  if ("promptForAgent" in config) promptFn = config.promptForAgent ?? null;
  if ("recordDecision" in config) recordFn = config.recordDecision ?? null;
}

// ─── router-llm feature gate ──────────────────────────────────────────────────

function isRouterLlmEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .includes("router-llm");
}

// ─── autoAssign ───────────────────────────────────────────────────────────────

export async function autoAssign(
  input: AutoAssignInput,
): Promise<RoutingDecision | null> {
  // Tier 1: explicit override
  const agentOverride = input.agentOverride?.trim();
  if (agentOverride) {
    return emit(input, {
      ruleId: null,
      source: "explicit",
      agent: agentOverride,
      confidence: 1.0,
    });
  }

  // Tier 2: rules-engine (deterministic)
  const match = await evaluateRuleMatch(input.taskFacts, input.orgId, input.projectId);
  if (match) {
    return emit(input, {
      ruleId: match.ruleId,
      source: "rule",
      agent: match.agent,
      confidence: 1.0,
    });
  }

  // dryRun: no prompt, no learning, return null
  if (input.dryRun) return null;

  // Tier 3 LLM fallback gated — skip if flag OFF (handled elsewhere when ON)
  if (isRouterLlmEnabled()) return null;

  // Interactive no-match prompt
  const prompt = promptFn ?? defaultPrompt;
  const agent = (await prompt(input.taskFacts)).trim();
  if (!agent) return null;

  // Store learned rule for future Tier 2 resolution
  const rule = await learnRule(input.taskFacts, agent, input.orgId, input.projectId);

  return emit(input, {
    ruleId: rule.id,
    source: "learned",
    agent,
    confidence: 1.0,
  });
}

// ─── internal helpers ─────────────────────────────────────────────────────────

async function emit(
  input: AutoAssignInput,
  decision: RoutingDecision,
): Promise<RoutingDecision> {
  if (!input.dryRun && recordFn) {
    await recordFn({ input, decision });
  }
  return decision;
}
