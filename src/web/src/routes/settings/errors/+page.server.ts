import type { PageServerLoad, Actions } from "./$types";
import { openProductDb } from "$lib/server/db";
import { fail } from "@sveltejs/kit";

const PAGE_SIZE = 20;

export const load: PageServerLoad = ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  return {
    page,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS error_logs (
              id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              message TEXT NOT NULL,
              stack_trace TEXT,
              context JSONB NOT NULL DEFAULT '{}',
              os TEXT,
              version TEXT,
              occurred_at TEXT NOT NULL DEFAULT now()::text
            )
          `);
          // Seed sample data if empty
          const existing = await db.query<{ count: string }>(`SELECT count(*) as count FROM error_logs`);
          if (parseInt(existing[0]?.count ?? "0", 10) === 0) {
            await db.query(`
              INSERT INTO error_logs (id, message, stack_trace, context, os, version, occurred_at)
              VALUES
                (gen_random_uuid()::text, 'TypeError: Cannot read properties of undefined', 'at foo.ts:12\n    at bar.ts:34', '{"component":"AppSidebar"}', 'darwin 25.4.0', '0.9.1', now()::text),
                (gen_random_uuid()::text, 'NetworkError: fetch failed', 'at api.ts:56\n    at load.ts:8', '{"url":"/api/projects"}', 'darwin 25.4.0', '0.9.1', now()::text)
            `);
          }
          const offset = (page - 1) * PAGE_SIZE;
          const totalRows = await db.query<{ count: string }>(`SELECT count(*) as count FROM error_logs`);
          const total = parseInt(totalRows[0]?.count ?? "0", 10);
          const rows = await db.query<{
            id: string;
            message: string;
            stack_trace: string | null;
            context: unknown;
            os: string | null;
            version: string | null;
            occurred_at: string;
          }>(`SELECT id, message, stack_trace, context, os, version, occurred_at
              FROM error_logs ORDER BY occurred_at DESC LIMIT $1 OFFSET $2`, [PAGE_SIZE, offset]);
          return { errors: rows, total, page, pageSize: PAGE_SIZE };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  clearBefore: async ({ request }) => {
    const data = await request.formData();
    const before = data.get("before") as string;
    if (!before) return fail(400, { error: "before date required" });
    const db = await openProductDb();
    try {
      await db.query(`DELETE FROM error_logs WHERE occurred_at < $1`, [before]);
      return { success: true };
    } finally {
      await db.close();
    }
  },
};
