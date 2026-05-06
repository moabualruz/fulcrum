import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { RoutingRule } from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import {
  routingApplication,
  type RoutingApplication,
} from "../application/routing.ts";
import type { TaskFacts } from "./types.ts";

interface NoMatchPromptConfig {
  routingRuleRepository?: RoutingRuleRepository | null;
  application?: Pick<RoutingApplication, "learnRoutingRule"> | null;
}

let configuredRepository: RoutingRuleRepository | null = null;
let application: Pick<RoutingApplication, "learnRoutingRule"> = routingApplication;

export function configureNoMatchPrompt(config: NoMatchPromptConfig): void {
  configuredRepository = config.routingRuleRepository ?? null;
  application = config.application ?? routingApplication;
}

export async function promptForAgent(facts: TaskFacts): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `No rule matched for this task (${facts.task.kind}). Pick an agent or write a rule: `,
    );
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function learnRule(
  facts: TaskFacts,
  agent: string,
  orgId: string,
  projectId?: string,
): Promise<RoutingRule> {
  const input = {
    facts,
    agent,
    orgId,
    projectId,
  };
  return application.learnRoutingRule(
    configuredRepository
      ? { ...input, routingRuleRepository: configuredRepository }
      : input,
  );
}
