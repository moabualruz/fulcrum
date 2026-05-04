import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { indexSearchDocument, searchProductDocuments } from "./search.ts";
import { createLocalOrg, createProject } from "./store/repositories.ts";
import type { ProductDb } from "./db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-retriever-det-"));
let db: ProductDb;
let orgId: string;

beforeAll(async () => {
  db = await openPglite(join(scratch, "det"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "det", name: "Det Org" });
  orgId = org.id;
  const project = await createProject(db, { orgId, slug: "p", name: "P" });

  // Seed 30 documents with varied content for FTS ranking
  for (let i = 0; i < 30; i++) {
    await indexSearchDocument(db, {
      orgId,
      projectId: project.id,
      sourceKind: "document",
      sourceId: `doc-${i.toString().padStart(3, "0")}`,
      title: `Document ${i}: ${["architecture", "testing", "deployment", "migration", "review"][i % 5]} notes`,
      body: `Body content for document ${i}. Covers ${["schema design", "unit testing patterns", "CI pipeline", "database migration", "code review"][i % 5]} in detail.`,
    });
  }
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("retriever determinism", () => {
  test("100 sequential calls produce identical top-20 list", async () => {
    const query = "architecture design";
    let baseline: string[] | null = null;

    for (let i = 0; i < 100; i++) {
      const results = await searchProductDocuments(db, query, {
        orgId,
        limit: 20,
      });
      const ids = results.map((r) => r.source_id);
      if (baseline === null) {
        baseline = ids;
        expect(ids.length).toBeGreaterThan(0);
      } else {
        expect(ids).toEqual(baseline);
      }
    }
  });
});
