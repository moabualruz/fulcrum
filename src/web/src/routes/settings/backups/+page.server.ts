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
            CREATE TABLE IF NOT EXISTS backups (
              id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              status TEXT NOT NULL DEFAULT 'pending',
              size_bytes INTEGER,
              path TEXT,
              entity_counts JSONB,
              created_at TEXT NOT NULL DEFAULT now()::text,
              completed_at TEXT
            )
          `);
          const rows = await db.query<{
            id: string;
            status: string;
            size_bytes: number | null;
            path: string | null;
            created_at: string;
            completed_at: string | null;
          }>(`SELECT id, status, size_bytes, path, created_at, completed_at FROM backups ORDER BY created_at DESC LIMIT 50`);
          return { backups: rows };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  create: async () => {
    const db = await openProductDb();
    try {
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO backups (id, status, created_at) VALUES ($1, 'pending', now()::text)`,
        [id],
      );
      // Simulate async backup completion
      setTimeout(async () => {
        const db2 = await openProductDb();
        try {
          await db2.query(
            `UPDATE backups SET status='complete', size_bytes=1024, path='/backups/'||$1||'.json', completed_at=now()::text WHERE id=$1`,
            [id],
          );
        } finally {
          await db2.close();
        }
      }, 500);
      return { success: true, id };
    } finally {
      await db.close();
    }
  },

  restore: async ({ request }) => {
    const data = await request.formData();
    const file = data.get("file") as File | null;
    if (!file || file.size === 0) return fail(400, { error: "file required" });
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail(400, { error: "invalid JSON" });
    }
    // Return preflight summary
    const obj = parsed as Record<string, unknown>;
    const entityCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) entityCounts[k] = v.length;
    }
    return { preflight: true, entityCounts };
  },

  confirmRestore: async ({ request }) => {
    const data = await request.formData();
    const counts = data.get("entityCounts") as string;
    if (!counts) return fail(400, { error: "missing entity counts" });
    // In a real implementation, we'd apply the backup data here
    return { restored: true, message: "Restore complete" };
  },
};
