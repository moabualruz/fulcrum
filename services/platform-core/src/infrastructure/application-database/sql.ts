import { mkdir } from "node:fs/promises";
import pg from "pg";

export type SqlValue = string | number | boolean | null | Uint8Array;

export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}

export async function openLocalSqlStore(dataDir: string): Promise<SqlExecutor> {
  await mkdir(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const db = new PGlite(dataDir, { extensions: { vector } });
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

export function openPostgresSqlStore(connectionString: string): SqlExecutor {
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
