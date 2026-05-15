/**
 * MikroORM config stub — MikroORM has been replaced by TypeORM.
 * This file exists only to satisfy legacy imports that have not yet been
 * migrated. All functions throw at runtime; only compile-time compatibility
 * is preserved.
 */

export async function initOrm(_options?: unknown): Promise<never> {
  throw new Error(
    "MikroORM has been replaced by TypeORM. Use createTestOrm() from @test-support/application-database.ts instead.",
  );
}
