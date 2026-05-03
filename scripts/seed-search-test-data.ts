#!/usr/bin/env bun
/**
 * Seed script: creates 1 entity per search kind (8 total) in a test org.
 * Callable from test setup or standalone.
 *
 * Usage:
 *   bun run scripts/seed-search-test-data.ts [--db-path <path>]
 *
 * All 8 kinds share a common term "fulcrum-searchable" so a single query
 * returns all of them.
 */

import { openPglite } from "../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../src/product-kernel/db/migrate.ts";
import { createLocalOrg } from "../src/product-kernel/store/repositories.ts";
import { indexSearchDocument } from "../src/product-kernel/search.ts";
import type { ProductDb } from "../src/product-kernel/db/types.ts";

const COMMON_TERM = "fulcrum-searchable";

const KINDS = [
  "task",
  "doc",
  "memory",
  "run",
  "artifact",
  "repo",
  "project",
  "sprint",
] as const;

export interface SeedResult {
  orgId: string;
  seeded: Array<{ sourceKind: string; sourceId: string }>;
}

export async function seedSearchTestData(db: ProductDb, orgId: string): Promise<SeedResult> {
  const seeded: SeedResult["seeded"] = [];
  for (const kind of KINDS) {
    const sourceId = `${kind}-seed-1`;
    await indexSearchDocument(db, {
      orgId,
      sourceKind: kind,
      sourceId,
      title: `${COMMON_TERM} ${kind} title`,
      body: `${COMMON_TERM} ${kind} body content for testing`,
    });
    seeded.push({ sourceKind: kind, sourceId });
  }
  return { orgId, seeded };
}

if (import.meta.main) {
  const dbPathArg = process.argv.indexOf("--db-path");
  const dbPath = dbPathArg !== -1 ? process.argv[dbPathArg + 1] : undefined;
  if (!dbPath) {
    console.error("usage: seed-search-test-data.ts --db-path <path>");
    process.exit(2);
  }
  const db = await openPglite(dbPath);
  try {
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Local" });
    const result = await seedSearchTestData(db, org.id);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.close();
  }
}
