import { PGlite } from "@electric-sql/pglite";
import type { ProductDb, SqlValue } from "./types.ts";

export async function openPglite(dataDir: string): Promise<ProductDb> {
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    engine: "pglite",
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      const result = await db.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}
