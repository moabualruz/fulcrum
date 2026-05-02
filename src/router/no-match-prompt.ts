/**
 * no-match-prompt.ts — interactive fallback when Tier 1 + Tier 2 both return null.
 *
 * C4 (three-surface parity): `promptForAgent` is injectable so TUI and Web surfaces
 * can substitute their own UI (e.g. a React modal or Ink Select) without re-implementing
 * the rule-learning logic. Tests inject a synchronous mock; CLI uses the readline impl.
 *
 * C1 (FULCRUM_FEATURES gate): callers must check the `router-llm` flag before falling
 * back to LLM; this module is the interactive non-LLM fallback that runs when that
 * flag is OFF.
 *
 * C2 (org_id + composite indexes): routing_rules rows are always scoped by org_id.
 * The 0004_routing_rules migration adds the required composite indexes.
 */

import { createInterface } from "node:readline";
import { newUlid } from "../product-kernel/ids.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import type { TaskFacts } from "./types.ts";
import type { RoutingRuleRow, RoutingRuleRepository } from "./rules-engine.ts";

// ─── injectable prompt ────────────────────────────────────────────────────────

/** Default CLI prompt — reads from stdin. Replaced in tests / TUI / Web. */
async function cliPromptForAgent(facts: TaskFacts): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `No routing rule matched for task kind "${facts.task.kind}". Pick an agent: `,
      (answer) => {
        rl.close();
        resolve(answer.trim());
      },
    );
  });
}

// ─── DB handle (module-level, injectable for tests) ──────────────────────────

let db: ProductDb | null = null;

/** Inject a ProductDb instance (required before learnRule can persist). */
export function setRoutingRulesDb(instance: ProductDb): void {
  db = instance;
}

// ─── learnRule ────────────────────────────────────────────────────────────────

/**
 * Persist a new `routing_rules` row with source='learned'.
 * conditions_json is derived from the task's `kind` field (minimum viable).
 */
export async function learnRule(
  facts: TaskFacts,
  agent: string,
  orgId: string,
  projectId?: string,
): Promise<RoutingRuleRow> {
  if (!db) {
    throw new Error("learnRule: no ProductDb configured — call setRoutingRulesDb first");
  }

  const id = newUlid();
  const conditionsJson = {
    all: [{ fact: "task.kind", operator: "equal", value: facts.task.kind }],
  };
  const conditionsJsonStr = JSON.stringify(conditionsJson);

  await db.query(
    `INSERT INTO routing_rules
       (id, org_id, project_id, name, conditions_json, action_agent, action_skill_set,
        priority, enabled, source)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, '[]'::jsonb, 100, true, 'learned')`,
    [
      id,
      orgId,
      projectId ?? null,
      `learned: ${facts.task.kind} → ${agent}`,
      conditionsJsonStr,
      agent,
    ],
  );

  const rows = await db.query<RoutingRuleRow>(
    `SELECT * FROM routing_rules WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) throw new Error(`learnRule: insert lost row ${id}`);
  const row = rows[0] as RoutingRuleRow;

  // Normalise conditions_json: PGlite may return it as a parsed object already.
  if (typeof row.conditions_json === "string") {
    row.conditions_json = JSON.parse(row.conditions_json as unknown as string);
  }
  return row;
}

// ─── DB-backed RoutingRuleRepository ─────────────────────────────────────────

/**
 * Lightweight ProductDb-backed repository that satisfies the RoutingRuleRepository
 * interface expected by rules-engine. Used after learnRule stores a row so that
 * a second autoAssign call can find the learned rule via Tier 2.
 */
export function createDbRoutingRuleRepository(
  productDb: ProductDb,
): RoutingRuleRepository {
  return {
    async findEnabledForDispatch(
      orgId: string,
      projectId?: string | null,
    ): Promise<RoutingRuleRow[]> {
      let sql: string;
      let params: (string | null)[];

      if (projectId) {
        sql = `SELECT * FROM routing_rules
               WHERE org_id = $1 AND enabled = true
                 AND (project_id = $2 OR project_id IS NULL)
               ORDER BY priority ASC, created_at ASC`;
        params = [orgId, projectId];
      } else {
        sql = `SELECT * FROM routing_rules
               WHERE org_id = $1 AND enabled = true AND project_id IS NULL
               ORDER BY priority ASC, created_at ASC`;
        params = [orgId];
      }

      const rows = await productDb.query<RoutingRuleRow>(sql, params);
      // Normalise conditions_json for each row
      return rows.map((row) => {
        if (typeof row.conditions_json === "string") {
          return {
            ...row,
            conditions_json: JSON.parse(row.conditions_json as unknown as string),
          };
        }
        return row;
      });
    },
    getEntityManager() {
      return {
        async flush() {
          return undefined;
        },
      };
    },
  };
}

// ─── exported promptForAgent (injectable) ────────────────────────────────────

export { cliPromptForAgent as promptForAgent };
