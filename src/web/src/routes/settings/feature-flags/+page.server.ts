import type { PageServerLoad, Actions } from "./$types";
import { openProductDb } from "$lib/server/db";
import { fail } from "@sveltejs/kit";

export const load: PageServerLoad = () => {
  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS feature_flags (
              id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              name TEXT NOT NULL UNIQUE,
              enabled BOOLEAN NOT NULL DEFAULT false,
              rollout_percent INTEGER NOT NULL DEFAULT 0,
              cohort_rules JSONB NOT NULL DEFAULT '{}',
              docs_url TEXT,
              updated_at TEXT NOT NULL DEFAULT now()::text
            )
          `);
          // Seed some default flags if empty
          await db.query(`
            INSERT INTO feature_flags (name, enabled, rollout_percent)
            VALUES
              ('agent-streaming', false, 0),
              ('multi-org', false, 0),
              ('dark-mode-v2', true, 100)
            ON CONFLICT (name) DO NOTHING
          `);
          const rows = await db.query<{
            id: string;
            name: string;
            enabled: boolean;
            rollout_percent: number;
            cohort_rules: unknown;
            docs_url: string | null;
            updated_at: string;
          }>(`SELECT id, name, enabled, rollout_percent, cohort_rules, docs_url, updated_at FROM feature_flags ORDER BY name`);
          return { flags: rows };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    const db = await openProductDb();
    try {
      await db.query(
        `UPDATE feature_flags SET enabled = NOT enabled, updated_at = now()::text WHERE id = $1`,
        [id],
      );
      return { success: true };
    } finally {
      await db.close();
    }
  },

  setRollout: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const pct = parseInt(data.get("rollout_percent") as string, 10);
    if (!id || isNaN(pct) || pct < 0 || pct > 100) return fail(400, { error: "invalid" });
    const db = await openProductDb();
    try {
      await db.query(
        `UPDATE feature_flags SET rollout_percent = $1, updated_at = now()::text WHERE id = $2`,
        [pct, id],
      );
      return { success: true };
    } finally {
      await db.close();
    }
  },

  setCohortRules: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const rulesStr = data.get("cohort_rules") as string;
    if (!id) return fail(400, { error: "id required" });
    let rules: unknown;
    try {
      rules = JSON.parse(rulesStr || "{}");
    } catch {
      return fail(400, { error: "invalid JSON" });
    }
    const db = await openProductDb();
    try {
      await db.query(
        `UPDATE feature_flags SET cohort_rules = $1::jsonb, updated_at = now()::text WHERE id = $2`,
        [JSON.stringify(rules), id],
      );
      return { success: true };
    } finally {
      await db.close();
    }
  },
};
