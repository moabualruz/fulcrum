import type { ProductDb, SqlValue } from "./types.ts";
import { mkdir } from "node:fs/promises";

export function isCompiledBunBinary(): boolean {
  // `bun build --compile` mounts the embedded module graph at /$bunfs/.
  // import.meta.url reflects that mount even when process.argv[0] is "bun".
  const url = (import.meta?.url ?? "").replace(/\\/g, "/");
  if (url.includes("/$bunfs/")) return true;
  const argv0 = (process.argv[0] ?? "").replace(/\\/g, "/");
  if (argv0.includes("/$bunfs/")) return true;
  return false;
}

export async function openPglite(dataDir: string): Promise<ProductDb> {
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
