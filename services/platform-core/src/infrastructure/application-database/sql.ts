import { mkdir } from "node:fs/promises";
import pg from "pg";
import { assertPgliteLockRecoverable } from "@platform-core/application/db/pglite-lock-recovery.ts";

export type SqlValue = string | number | boolean | null | Uint8Array;

export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}

export async function openLocalSqlStore(dataDir: string): Promise<SqlExecutor> {
  await mkdir(dataDir, { recursive: true });
  await assertPgliteLockRecoverable(dataDir);
  const { PGlite } = await import("@electric-sql/pglite");
  // String-keyed dynamic import keeps `bun build --compile` from statically
  // resolving + bundling vector.tar.gz (which a compiled $bunfs cannot read).
  // Skip the extension entirely inside a compiled binary; non-vector queries
  // keep working.
  const url = (import.meta?.url ?? "").replace(/\\/g, "/");
  const isCompiled = url.includes("/$bunfs/")
    || (process.argv[0] ?? "").replace(/\\/g, "/").includes("/$bunfs/");
  let vectorExtension: unknown = null;
  if (!isCompiled) {
    try {
      const vectorModule = "@electric-sql/pglite/vector";
      const mod = await import(vectorModule);
      vectorExtension = (mod as { vector?: unknown }).vector ?? null;
    } catch {
      vectorExtension = null;
    }
  }
  const db = vectorExtension
    ? new PGlite(dataDir, { extensions: { vector: vectorExtension as never } })
    : new PGlite(dataDir);
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
