import type { PageServerLoad, Actions } from "./$types";
import { openDatabase } from "$lib/server/db";
import { fail } from "@sveltejs/kit";

export const load: PageServerLoad = () => {
  return {
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          // Ensure table exists
          await db.query(`
            CREATE TABLE IF NOT EXISTS credentials (
              id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              name TEXT NOT NULL UNIQUE,
              provider TEXT NOT NULL DEFAULT '',
              value_hash TEXT NOT NULL DEFAULT '',
              last_used_at TEXT,
              archived BOOLEAN NOT NULL DEFAULT false,
              created_at TEXT NOT NULL DEFAULT now()::text
            )
          `);
          const rows = await db.query<{
            id: string;
            name: string;
            provider: string;
            last_used_at: string | null;
            archived: boolean;
            created_at: string;
          }>(`SELECT id, name, provider, last_used_at, archived, created_at FROM credentials ORDER BY created_at DESC`);
          return { credentials: rows };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions: Actions = {
  add: async ({ request }) => {
    const data = await request.formData();
    const name = (data.get("name") as string)?.trim();
    const value = (data.get("value") as string)?.trim();
    const provider = (data.get("provider") as string)?.trim() ?? "";
    if (!name || !value) return fail(400, { error: "name and value required" });
    const db = await openDatabase();
    try {
      await db.query(`
        INSERT INTO credentials (id, name, provider, value_hash, created_at)
        VALUES (gen_random_uuid()::text, $1, $2, $3, now()::text)
        ON CONFLICT (name) DO UPDATE SET provider = EXCLUDED.provider, value_hash = EXCLUDED.value_hash
      `, [name, provider, `b64:${Buffer.from(value).toString("base64")}`]);
      return { success: true };
    } finally {
      await db.close();
    }
  },

  rotate: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const value = (data.get("value") as string)?.trim();
    if (!id || !value) return fail(400, { error: "id and value required" });
    const db = await openDatabase();
    try {
      await db.query(
        `UPDATE credentials SET value_hash = $1, last_used_at = now()::text WHERE id = $2`,
        [`b64:${Buffer.from(value).toString("base64")}`, id],
      );
      return { success: true };
    } finally {
      await db.close();
    }
  },

  archive: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    const db = await openDatabase();
    try {
      await db.query(`UPDATE credentials SET archived = NOT archived WHERE id = $1`, [id]);
      return { success: true };
    } finally {
      await db.close();
    }
  },

  delete: async ({ request }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    const db = await openDatabase();
    try {
      await db.query(`DELETE FROM credentials WHERE id = $1`, [id]);
      return { success: true };
    } finally {
      await db.close();
    }
  },
};
