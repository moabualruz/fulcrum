/**
 * migration-checksums — SHA-256 utility for migration file content.
 *
 * Used by MigratorService when writing SchemaMigration rows at apply-time.
 * Also used by doctor checks to verify on-disk files match stored checksums.
 *
 * Uses Bun.file + crypto.subtle so it stays runtime-agnostic for tests
 * (Bun exposes crypto.subtle natively).
 *
 * C6: No raw SQL.
 */

/**
 * Compute SHA-256 hex digest of a string (migration file content).
 * Uses the Web Crypto API (available in Bun natively).
 */
export async function sha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Read a migration file from disk and return its SHA-256 hex digest.
 * Pass the absolute path to the migration .ts file.
 */
export async function checksumFile(filePath: string): Promise<string> {
  const content = await Bun.file(filePath).text();
  return sha256Hex(content);
}
