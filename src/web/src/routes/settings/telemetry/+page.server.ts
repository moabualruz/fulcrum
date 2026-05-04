import type { PageServerLoad, Actions } from "./$types";
import { openProductDb } from "$lib/server/db";

export const load: PageServerLoad = () => {
  return {
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          await db.query(`
            CREATE TABLE IF NOT EXISTS telemetry_settings (
              id TEXT PRIMARY KEY DEFAULT 'singleton',
              opt_in BOOLEAN NOT NULL DEFAULT false,
              updated_at TEXT NOT NULL DEFAULT now()::text
            )
          `);
          await db.query(`
            INSERT INTO telemetry_settings (id, opt_in) VALUES ('singleton', false)
            ON CONFLICT (id) DO NOTHING
          `);
          await db.query(`
            CREATE TABLE IF NOT EXISTS telemetry_events (
              id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              event TEXT NOT NULL,
              occurred_at TEXT NOT NULL DEFAULT now()::text
            )
          `);
          const settings = await db.query<{ opt_in: boolean }>(`SELECT opt_in FROM telemetry_settings WHERE id = 'singleton'`);
          const count = await db.query<{ count: string }>(`SELECT count(*) as count FROM telemetry_events`);
          return {
            optIn: settings[0]?.opt_in ?? false,
            rowCount: parseInt(count[0]?.count ?? "0", 10),
          };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

export const actions = {
  toggleOptIn: async () => {
    const db = await openProductDb();
    try {
      await db.query(`UPDATE telemetry_settings SET opt_in = NOT opt_in, updated_at = now()::text WHERE id = 'singleton'`);
      return { success: true };
    } finally {
      await db.close();
    }
  },

  purge: async () => {
    const db = await openProductDb();
    try {
      await db.query(`DELETE FROM telemetry_events`);
      return { success: true, rowCount: 0 };
    } finally {
      await db.close();
    }
  },
};
