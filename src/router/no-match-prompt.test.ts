import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../product-kernel/store/repositories.ts";
import {
  configureAutoAssign,
  autoAssign,
} from "./auto-assign.ts";
import {
  configureRulesEngine,
} from "./rules-engine.ts";
import {
  learnRule,
  setRoutingRulesDb,
} from "./no-match-prompt.ts";
import type { TaskFacts } from "./types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-router-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

const TASK_FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend"],
    title: "Fix the router",
  },
};

describe("no-match-prompt: learnRule", () => {
  test("stores a routing_rules row with source='learned' and enabled=true", async () => {
    const db = await freshDb("learn-rule");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "o1", name: "Org1" });
      const rule = await learnRule(TASK_FACTS, "codex", org.id);

      expect(rule.id).toBeTruthy();
      expect(rule.source).toBe("learned");
      expect(rule.enabled).toBe(true);
      expect(rule.action_agent).toBe("codex");
      expect(rule.org_id).toBe(org.id);
      expect(rule.conditions_json).toMatchObject({
        all: [expect.objectContaining({ value: "bug" })],
      });
    } finally {
      await db.close();
    }
  });

  test("stores conditions_json derived from task kind", async () => {
    const db = await freshDb("learn-cond");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "o2", name: "Org2" });
      const rule = await learnRule(
        { task: { kind: "feature", priority: "low", tags: [], title: "New thing" } },
        "claude-code",
        org.id,
      );
      expect(rule.conditions_json).toEqual({
        all: [{ fact: "task.kind", operator: "equal", value: "feature" }],
      });
    } finally {
      await db.close();
    }
  });

  test("scopes rule to projectId when supplied", async () => {
    const db = await freshDb("learn-project");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "o3", name: "Org3" });
      const rule = await learnRule(TASK_FACTS, "gemini", org.id, "proj-abc");
      expect(rule.project_id).toBe("proj-abc");
    } finally {
      await db.close();
    }
  });
});

describe("no-match-prompt: autoAssign integration", () => {
  test("prompt is called when no rule matches and router-llm is OFF; learned rule stored", async () => {
    const db = await freshDb("auto-prompt");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "ap1", name: "AP1" });

      // Empty rules repository — Tier 2 returns null
      configureRulesEngine({
        routingRuleRepository: {
          async findEnabledForDispatch() { return []; },
          getEntityManager() { return { async flush() { return undefined; } }; },
        } as never,
      });

      let promptCalled = false;
      configureAutoAssign({
        promptForAgent: async (_facts: TaskFacts) => {
          promptCalled = true;
          return "codex";
        },
        recordDecision: async () => {},
      });

      const decision = await autoAssign({
        taskId: "task-1",
        taskFacts: TASK_FACTS,
        orgId: org.id,
      });

      expect(promptCalled).toBe(true);
      expect(decision).toMatchObject({ source: "learned", agent: "codex" });

      // Verify row in DB
      const rows = await db.query<{ source: string; action_agent: string }>(
        "SELECT source, action_agent FROM routing_rules WHERE org_id = $1",
        [org.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe("learned");
      expect(rows[0]!.action_agent).toBe("codex");
    } finally {
      configureRulesEngine({ routingRuleRepository: null });
      configureAutoAssign({ promptForAgent: null, recordDecision: null });
      await db.close();
    }
  });

  test("second identical call resolves via learned rule without prompting", async () => {
    const db = await freshDb("auto-second");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "ap2", name: "AP2" });

      let promptCalls = 0;

      // First call: no rules, prompt fires, rule stored
      configureRulesEngine({
        routingRuleRepository: {
          async findEnabledForDispatch() { return []; },
          getEntityManager() { return { async flush() { return undefined; } }; },
        } as never,
      });
      configureAutoAssign({
        promptForAgent: async () => { promptCalls++; return "codex"; },
        recordDecision: async () => {},
      });

      await autoAssign({ taskId: "t1", taskFacts: TASK_FACTS, orgId: org.id });
      expect(promptCalls).toBe(1);

      // Second call: use real DB-backed rules engine which will find the learned rule
      const { createDbRoutingRuleRepository } = await import("./no-match-prompt.ts");
      const repo = createDbRoutingRuleRepository(db);
      configureRulesEngine({ routingRuleRepository: repo });
      configureAutoAssign({
        promptForAgent: async () => { promptCalls++; return "should-not-be-called"; },
        recordDecision: async () => {},
      });

      const decision = await autoAssign({ taskId: "t2", taskFacts: TASK_FACTS, orgId: org.id });
      expect(promptCalls).toBe(1); // no second prompt
      expect(decision).toMatchObject({ source: "rule", agent: "codex" });
    } finally {
      configureRulesEngine({ routingRuleRepository: null });
      configureAutoAssign({ promptForAgent: null, recordDecision: null });
      await db.close();
    }
  });

  test("dryRun=true: no prompt called, no rule stored, returns null", async () => {
    const db = await freshDb("auto-dryrun");
    try {
      setRoutingRulesDb(db);
      const org = await createLocalOrg(db, { slug: "dry1", name: "Dry1" });

      configureRulesEngine({
        routingRuleRepository: {
          async findEnabledForDispatch() { return []; },
          getEntityManager() { return { async flush() { return undefined; } }; },
        } as never,
      });

      let promptCalled = false;
      configureAutoAssign({
        promptForAgent: async () => { promptCalled = true; return "codex"; },
        recordDecision: async () => {},
      });

      const decision = await autoAssign({
        taskId: "t-dry",
        taskFacts: TASK_FACTS,
        orgId: org.id,
        dryRun: true,
      });

      expect(promptCalled).toBe(false);
      expect(decision).toBeNull();

      const rows = await db.query(
        "SELECT id FROM routing_rules WHERE org_id = $1",
        [org.id],
      );
      expect(rows).toHaveLength(0);
    } finally {
      configureRulesEngine({ routingRuleRepository: null });
      configureAutoAssign({ promptForAgent: null, recordDecision: null });
      await db.close();
    }
  });
});
