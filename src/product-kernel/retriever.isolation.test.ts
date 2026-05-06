import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { indexSearchDocument, searchProductDocuments } from "./search.ts";
import { createLocalOrg } from "../test-support/product-fixtures.ts";
import type { TestStore } from "../test-support/product-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-retriever-iso-"));
let db: TestStore;
let orgAId: string;
let orgBId: string;

beforeAll(async () => {
  db = await openIsolatedStore(join(scratch, "iso"));
  await migrateIsolatedStore(db);
  const orgA = await createLocalOrg(db, { slug: "org-a", name: "Org A" });
  const orgB = await createLocalOrg(db, { slug: "org-b", name: "Org B" });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Seed org A docs
  await indexSearchDocument(db, {
    orgId: orgAId,
    sourceKind: "document",
    sourceId: "a-doc-1",
    title: "Org A secret architecture",
    body: "Internal architecture document for org A only",
  });
  await indexSearchDocument(db, {
    orgId: orgAId,
    sourceKind: "document",
    sourceId: "a-doc-2",
    title: "Org A deployment guide",
    body: "Deployment guide exclusive to org A",
  });

  // Seed org B docs
  await indexSearchDocument(db, {
    orgId: orgBId,
    sourceKind: "document",
    sourceId: "b-doc-1",
    title: "Org B architecture overview",
    body: "Architecture document for org B",
  });
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("retriever isolation", () => {
  test("org A memories absent from org B results", async () => {
    const orgBResults = await searchProductDocuments(db, "architecture", {
      orgId: orgBId,
      limit: 20,
    });
    const orgBSourceIds = orgBResults.map((r) => r.source_id);

    // Org B should only see its own docs
    expect(orgBSourceIds).toContain("b-doc-1");
    expect(orgBSourceIds).not.toContain("a-doc-1");
    expect(orgBSourceIds).not.toContain("a-doc-2");
  });

  test("org A results do not leak org B docs", async () => {
    const orgAResults = await searchProductDocuments(db, "architecture", {
      orgId: orgAId,
      limit: 20,
    });
    const orgASourceIds = orgAResults.map((r) => r.source_id);

    expect(orgASourceIds).toContain("a-doc-1");
    expect(orgASourceIds).not.toContain("b-doc-1");
  });
});
