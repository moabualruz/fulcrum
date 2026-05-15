import pg from "pg";
import type { ProductDb, SqlValue } from "./types.ts";

export function openPostgres(connectionString: string): ProductDb {
  const pool = new pg.Pool({ connectionString });
  return {
    engine: "postgres",
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}
