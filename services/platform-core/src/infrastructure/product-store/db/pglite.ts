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
  // PGlite accepts a filesystem path OR an in-memory URI (`memory://[label]`).
  // Only a real path needs its directory created — calling mkdir on a
  // `memory://…` URI would create a literal `./memory:/…` junk directory on
  // disk (":" is a valid filename character), which is never cleaned up.
  if (!dataDir.startsWith("memory://")) {
    await mkdir(dataDir, { recursive: true });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  // The vector extension ships as a tarball PGlite extracts on first run. A
  // Bun-compiled CLI binary cannot load that tarball from its embedded
  // `$bunfs` (`Extension bundle not found: file:///$bunfs/vector.tar.gz`).
  // Inside the compiled binary, skip the extension entirely — non-vector
  // queries keep working; only embedding / similarity calls degrade. Outside
  // the compiled binary, load it normally and fall back silently on failure.
  let vectorExtension: unknown = null;
  if (!isCompiledBunBinary()) {
    try {
      // Use a string-keyed dynamic import so `bun build --compile` does NOT
      // statically resolve + bundle the vector.tar.gz asset. The compiled
      // binary cannot read tarballs from its embedded `$bunfs`.
      const vectorModule = "@electric-sql/pglite/vector";
      const mod = await import(vectorModule);
      vectorExtension = (mod as { vector?: unknown }).vector ?? null;
    } catch {
      vectorExtension = null;
    }
  }
  const options = vectorExtension
    ? { extensions: { vector: vectorExtension as never } }
    : undefined;
  const db = new PGlite(dataDir, options);
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
