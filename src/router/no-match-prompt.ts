import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { Org } from "../db/entities/auth/Org.ts";
import {
  RoutingRule,
  RoutingRuleSource,
  type RoutingConditions,
} from "../db/entities/router/RoutingRule.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import type { TaskFacts } from "./types.ts";

interface NoMatchPromptConfig {
  routingRuleRepository?: RoutingRuleRepository | null;
}

let configuredRepository: RoutingRuleRepository | null = null;
let defaultRepositoryPromise: Promise<RoutingRuleRepository> | null = null;

export function configureNoMatchPrompt(config: NoMatchPromptConfig): void {
  configuredRepository = config.routingRuleRepository ?? null;
  if (configuredRepository) defaultRepositoryPromise = null;
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
  const repository = await getRoutingRuleRepository();
  const em = repository.getEntityManager();
  const rule = repository.create({
    org: em.getReference(Org, orgId),
    project: projectId ?? null,
    name: `Learned ${facts.task.kind} routing`,
    conditionsJson: conditionsFromFacts(facts),
    actionAgent: agent,
    actionSkillSet: [],
    priority: 100,
    enabled: true,
    source: RoutingRuleSource.Learned,
  } as never);

  if ("save" in repository && typeof repository.save === "function") {
    await repository.save(rule);
  } else {
    em.persist(rule);
    await em.flush();
  }

  return rule;
}

function conditionsFromFacts(facts: TaskFacts): RoutingConditions {
  return {
    all: [{ fact: "task", path: "$.kind", operator: "equal", value: facts.task.kind }],
  };
}

async function getRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  if (configuredRepository) return configuredRepository;
  defaultRepositoryPromise ??= initDefaultRoutingRuleRepository().catch((error) => {
    defaultRepositoryPromise = null;
    throw error;
  });
  return defaultRepositoryPromise;
}

async function initDefaultRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  const dbDir = join(process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum"), "db");
  await mkdir(dbDir, { recursive: true });
  const pglite = new PGlite(join(dbDir, "main"));
  await pglite.waitReady;
  const orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  return orm.em.fork().getRepository(RoutingRule) as RoutingRuleRepository;
}
