import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { MikroORM, type Options } from "@mikro-orm/postgresql";

import { Event } from "../db/entities/core/Event.ts";
import { Org } from "../db/entities/auth/Org.ts";
import {
  RoutingRule,
  RoutingRuleSource,
  type RoutingConditions,
} from "../db/entities/router/RoutingRule.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import type { EventRepository } from "../db/repositories/core/EventRepository.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID, SeedService } from "../db/seed.ts";
import { autoAssign, configureAutoAssign } from "./auto-assign.ts";
import { configureLlmFallback } from "./llm-fallback.ts";
import { configureNoMatchPrompt, learnRule } from "./no-match-prompt.ts";
import { RoutingEventPayloadSchema } from "./routing-event-payload.ts";
import type { RoutingEventBus } from "./event-bus.ts";
import { configureRulesEngine } from "./rules-engine.ts";
import { configureRoutingTelemetry } from "./telemetry.ts";
import type { TaskFacts } from "./types.ts";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

const TASK_FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend"],
    title: "Fix router assignment",
  },
};

const BUG_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
};

const DOCS_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "docs" }],
};

describe("autoAssign", () => {
  let rules: RoutingRule[];
  let recordCalls: number;
  let rulesChangedBus: RoutingEventBus | null;
  let savedFeatures: string | undefined;

  beforeEach(() => {
    rules = [];
    recordCalls = 0;
    rulesChangedBus = null;
    savedFeatures = process.env["FULCRUM_FEATURES"];
    configureRulesEngine({ routingRuleRepository: repository() });
    configureAutoAssign({
      recordDecision: async () => {
        recordCalls += 1;
      },
    });
  });

  afterEach(() => {
    configureRulesEngine({ routingRuleRepository: null });
    configureAutoAssign({ recordDecision: null });
    configureLlmFallback({ sidecarClient: null });
    configureNoMatchPrompt({ routingRuleRepository: null });
    configureRoutingTelemetry({ eventRepository: null });
    if (savedFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = savedFeatures;
    }
  });

  it("returns an explicit decision without evaluating matching rules", async () => {
    createRule({ name: "bugs", actionAgent: "claude-code", conditionsJson: BUG_CONDITIONS });
    configureRulesEngine({
      routingRuleRepository: {
        async findEnabledForDispatch() {
          throw new Error("rules engine should not be called for explicit override");
        },
      } as unknown as RoutingRuleRepository,
    });

    await expect(
      autoAssign({
        taskId: TASK_ID,
        agentOverride: "codex",
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
      }),
    ).resolves.toEqual({
      ruleId: null,
      source: "explicit",
      agent: "codex",
      confidence: 1.0,
    });
  });

  it("ignores a blank explicit override and falls through to matching rules", async () => {
    const rule = createRule({
      name: "bugs",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
    });

    await expect(
      autoAssign({
        taskId: TASK_ID,
        agentOverride: "",
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
      }),
    ).resolves.toEqual({
      ruleId: rule.id,
      source: "rule",
      agent: "codex",
      confidence: 1.0,
    });
  });

  it("returns a rule decision with the matched rule id", async () => {
    const rule = createRule({
      name: "bugs",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
    });

    await expect(
      autoAssign({ taskId: TASK_ID, taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID }),
    ).resolves.toEqual({
      ruleId: rule.id,
      source: "rule",
      agent: "codex",
      confidence: 1.0,
    });
  });

  it("falls through to prompt when router-llm enabled but sidecar returns null", async () => {
    createRule({ name: "docs", actionAgent: "claude-code", conditionsJson: DOCS_CONDITIONS });
    process.env["FULCRUM_FEATURES"] = "router-llm";
    let promptCalls = 0;
    configureAutoAssign({
      recordDecision: async () => { recordCalls += 1; },
      promptForAgent: async () => { promptCalls += 1; return ""; },
    });

    // No sidecar configured → llmFallback returns null → prompt returns "" → null
    await expect(
      autoAssign({ taskId: TASK_ID, taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID }),
    ).resolves.toBeNull();
    expect(promptCalls).toBe(1);
  });

  it("returns llm-fallback decision when router-llm enabled and sidecar succeeds", async () => {
    createRule({ name: "docs", actionAgent: "claude-code", conditionsJson: DOCS_CONDITIONS });
    process.env["FULCRUM_FEATURES"] = "router-llm";
    let promptCalls = 0;
    configureLlmFallback({
      sidecarClient: {
        healthCheck: async () => true,
        classify: async () => ({ agent: "codex", confidence: 0.85, reasoning: "bug task" }),
      },
    });
    configureAutoAssign({
      recordDecision: async () => { recordCalls += 1; },
      promptForAgent: async () => { promptCalls += 1; return "should-not-reach"; },
    });

    const result = await autoAssign({ taskId: TASK_ID, taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID });
    expect(result).toEqual({
      ruleId: null,
      source: "llm-fallback",
      agent: "codex",
      confidence: 0.85,
    });
    expect(promptCalls).toBe(0);
    expect(recordCalls).toBe(1);
  });

  it("prompts, stores a learned rule, then resolves the identical task without prompting", async () => {
    let promptCalls = 0;
    configureAutoAssign({
      recordDecision: async () => {
        recordCalls += 1;
      },
      promptForAgent: async () => {
        promptCalls += 1;
        return "codex";
      },
      learnRule: async (facts, agent, orgId, projectId) => {
        const rule = createRule({
          name: `Learned ${facts.task.kind} routing`,
          actionAgent: agent,
          conditionsJson: {
            all: [{ fact: "task", path: "$.kind", operator: "equal", value: facts.task.kind }],
          },
          project: projectId ?? null,
        });
        rule.source = RoutingRuleSource.Learned;
        rulesChangedBus?.emitRulesChanged();
        return rule;
      },
    });

    const learnedDecision = await autoAssign({
      taskId: TASK_ID,
      taskFacts: TASK_FACTS,
      orgId: DEFAULT_ORG_ID,
    });
    expect(learnedDecision).toEqual({
      ruleId: rules[0]!.id,
      source: "learned",
      agent: "codex",
      confidence: 1.0,
    });

    expect(promptCalls).toBe(1);
    expect(rules[0]!.source).toBe(RoutingRuleSource.Learned);
    expect(rules[0]!.enabled).toBe(true);
    expect(rules[0]!.conditionsJson).toEqual(BUG_CONDITIONS);

    const cachedDecision = await autoAssign({
      taskId: TASK_ID,
      taskFacts: TASK_FACTS,
      orgId: DEFAULT_ORG_ID,
    });
    expect(cachedDecision).toEqual({
      ruleId: rules[0]!.id,
      source: "rule",
      agent: "codex",
      confidence: 1.0,
    });
    expect(promptCalls).toBe(1);
  });

  it("does not prompt or store learned rules during dry runs", async () => {
    let promptCalls = 0;
    let learnCalls = 0;
    configureAutoAssign({
      promptForAgent: async () => {
        promptCalls += 1;
        return "codex";
      },
      learnRule: async () => {
        learnCalls += 1;
        throw new Error("dry run should not learn rules");
      },
    });

    await expect(
      autoAssign({
        taskId: TASK_ID,
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
        dryRun: true,
      }),
    ).resolves.toBeNull();

    expect(promptCalls).toBe(0);
    expect(learnCalls).toBe(0);
    expect(rules).toHaveLength(0);
  });

  it("suppresses routing event recording during dry runs", async () => {
    createRule({ name: "bugs", actionAgent: "codex", conditionsJson: BUG_CONDITIONS });

    await autoAssign({
      taskId: TASK_ID,
      taskFacts: TASK_FACTS,
      orgId: DEFAULT_ORG_ID,
      dryRun: true,
    });

    expect(recordCalls).toBe(0);
  });

  it("records routing decisions outside dry runs", async () => {
    createRule({ name: "bugs", actionAgent: "codex", conditionsJson: BUG_CONDITIONS });

    await autoAssign({ taskId: TASK_ID, taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID });

    expect(recordCalls).toBe(1);
  });

  it("writes exactly one routed events row for a real rule dispatch", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const repo = em.getRepository(RoutingRule) as RoutingRuleRepository;
      const rule = repo.create({
        org,
        name: "bugs",
        actionAgent: "codex",
        conditionsJson: BUG_CONDITIONS,
        actionSkillSet: [],
        priority: 100,
        enabled: true,
        source: RoutingRuleSource.Manual,
      } as never);
      await em.flush();

      configureRulesEngine({ routingRuleRepository: repo });
      configureAutoAssign({ recordDecision: null });
      configureRoutingTelemetry({
        eventRepository: em.getRepository(Event) as EventRepository,
      });

      await autoAssign({ taskId: TASK_ID, taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID });

      const events = await readRoutedEvents(em);
      expect(events).toHaveLength(1);
      expect(events[0]!.verb).toBe("routed");
      expect(events[0]!.subjectKind).toBe("task");
      expect(events[0]!.subjectId).toBe(TASK_ID);
      expect(RoutingEventPayloadSchema.parse(events[0]!.payload)).toEqual({
        rule_id: rule.id,
        source: "rule",
        agent: "codex",
        confidence: 1.0,
      });
    } finally {
      await db.close();
    }
  });

  it("writes zero routed events rows for dry-run dispatch", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const repo = em.getRepository(RoutingRule) as RoutingRuleRepository;
      repo.create({
        org,
        name: "bugs",
        actionAgent: "codex",
        conditionsJson: BUG_CONDITIONS,
        actionSkillSet: [],
        priority: 100,
        enabled: true,
        source: RoutingRuleSource.Manual,
      } as never);
      await em.flush();

      configureRulesEngine({ routingRuleRepository: repo });
      configureAutoAssign({ recordDecision: null });
      configureRoutingTelemetry({
        eventRepository: em.getRepository(Event) as EventRepository,
      });

      await autoAssign({
        taskId: TASK_ID,
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
        dryRun: true,
      });

      expect(await readRoutedEvents(em)).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("writes explicit routing events with null rule_id", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      configureAutoAssign({ recordDecision: null });
      configureRoutingTelemetry({
        eventRepository: em.getRepository(Event) as EventRepository,
      });

      await autoAssign({
        taskId: TASK_ID,
        agentOverride: "claude-code",
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
      });

      const events = await readRoutedEvents(em);
      expect(events).toHaveLength(1);
      expect(RoutingEventPayloadSchema.parse(events[0]!.payload)).toEqual({
        rule_id: null,
        source: "explicit",
        agent: "claude-code",
        confidence: 1.0,
      });
    } finally {
      await db.close();
    }
  });

  it("accepts llm-fallback routing payloads with non-null confidence", () => {
    expect(
      RoutingEventPayloadSchema.parse({
        rule_id: null,
        source: "llm-fallback",
        agent: "codex",
        confidence: 0.72,
      }),
    ).toEqual({
      rule_id: null,
      source: "llm-fallback",
      agent: "codex",
      confidence: 0.72,
    });
  });

  it("stores learned and llm-fallback routing event sources", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      configureRoutingTelemetry({
        eventRepository: em.getRepository(Event) as EventRepository,
      });
      const { recordRoutingEvent } = await import("./telemetry.ts");

      await recordRoutingEvent(
        {
          ruleId: "22222222-2222-4222-8222-222222222222",
          source: "learned",
          agent: "codex",
          confidence: 0.8,
        },
        TASK_ID,
        DEFAULT_ORG_ID,
        false,
      );
      await recordRoutingEvent(
        {
          ruleId: null,
          source: "llm-fallback",
          agent: "claude-code",
          confidence: 0.72,
        },
        TASK_ID,
        DEFAULT_ORG_ID,
        false,
      );

      const payloads = (await readRoutedEvents(em)).map((event) =>
        RoutingEventPayloadSchema.parse(event.payload),
      );
      expect(payloads).toEqual([
        {
          rule_id: "22222222-2222-4222-8222-222222222222",
          source: "learned",
          agent: "codex",
          confidence: 0.8,
        },
        {
          rule_id: null,
          source: "llm-fallback",
          agent: "claude-code",
          confidence: 0.72,
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("learnRule persists a learned routing rule derived from task kind", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const repo = em.getRepository(RoutingRule) as RoutingRuleRepository;
      configureNoMatchPrompt({ routingRuleRepository: repo });

      const rule = await learnRule(TASK_FACTS, "codex", DEFAULT_ORG_ID);

      const persisted = await repo.findOneOrFail({ id: rule.id } as never);
      expect(persisted.source).toBe(RoutingRuleSource.Learned);
      expect(persisted.enabled).toBe(true);
      expect(persisted.actionAgent).toBe("codex");
      expect(persisted.conditionsJson).toEqual(BUG_CONDITIONS);
    } finally {
      configureNoMatchPrompt({ routingRuleRepository: null });
      await db.close();
    }
  });

  function repository(): RoutingRuleRepository {
    return {
      setEventBus(bus: RoutingEventBus) {
        rulesChangedBus = bus;
      },
      async findEnabledForDispatch(orgId: string, projectId?: string | null) {
        return rules
          .filter((rule) => rule.org.id === orgId && rule.enabled)
          .filter((rule) =>
            projectId ? rule.project === projectId || rule.project === null : rule.project === null,
          )
          .sort(
            (left, right) =>
              left.priority - right.priority || left.createdAt.getTime() - right.createdAt.getTime(),
          );
      },
      getEntityManager() {
        return {
          async flush() {
            return undefined;
          },
          getReference(entity: unknown, id: string) {
            return { id, entity };
          },
        };
      },
    } as unknown as RoutingRuleRepository;
  }

  function createRule(input: {
    name: string;
    actionAgent: string;
    conditionsJson: RoutingConditions;
    priority?: number;
    project?: string | null;
  }): RoutingRule {
    const rule = {
      id: crypto.randomUUID(),
      org: { id: DEFAULT_ORG_ID },
      project: input.project ?? null,
      name: input.name,
      conditionsJson: input.conditionsJson,
      actionAgent: input.actionAgent,
      actionSkillSet: [],
      priority: input.priority ?? 100,
      enabled: true,
      source: RoutingRuleSource.Manual,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rules.length)),
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rules.length)),
    } as unknown as RoutingRule;
    rules.push(rule);
    return rule;
  }
});

async function buildMigratedOrm(): Promise<{
  orm: MikroORM;
  close: () => Promise<void>;
}> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
  };
  const orm = await MikroORM.init(config);
  await orm.migrator.up();
  await new SeedService(orm.em).run();

  return {
    orm,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function readRoutedEvents(em: MikroORM["em"]): Promise<Event[]> {
  return em.find(Event, { verb: "routed" } as never, {
    orderBy: { createdAt: "ASC" },
  });
}
