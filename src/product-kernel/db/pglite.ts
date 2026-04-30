import type { ProductDb, SqlValue } from "./types.ts";

/**
 * `bun build --compile` produces a single-file binary that mounts every
 * imported asset under `/$bunfs/root/...`. PGlite tries to read its native
 * `.data` blob from that path at runtime, but the bunfs is a read-only
 * virtual filesystem that the host process cannot open as a regular file —
 * the result is a cryptic `ENOENT: '/$bunfs/root/pglite.data'`.
 *
 * Detect the compiled-binary case up front and throw a clear, actionable
 * error instead. The product kernel is intentionally a development /
 * source-run feature today; the long-term fix is to either ship PGlite
 * unpacked alongside the binary or swap the engine for SQLite when running
 * compiled. Tracked in
 * `.scratch/migration-review-remediation/issues/13-compiled-binary-pglite-compat.md`.
 */
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
  if (isCompiledBunBinary()) {
    throw new Error(
      "fulcrum product kernel is not yet supported in the compiled `fulcrum` binary. " +
      "PGlite cannot load its data file from the bun:embedded virtual filesystem. " +
      "Run from source instead: `bun run src/index.ts product <verb>` " +
      "(tracked in .scratch/migration-review-remediation/issues/13-compiled-binary-pglite-compat.md)",
    );
  }
  // Lazy-import PGlite so the compiled binary doesn't try to extract its
  // wasm/data assets at import time and crash before our friendly error fires.
  const { PGlite } = await import("@electric-sql/pglite");
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
