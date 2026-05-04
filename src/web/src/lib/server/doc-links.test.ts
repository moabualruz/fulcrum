import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../../../product-kernel/store/repositories.ts";
import { createDocumentAction } from "./documents";
import { upsertDocLink, getBacklinks } from "./doc-links";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-links-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("doc links", () => {
  test("upsertDocLink creates a link and getBacklinks returns it", async () => {
    const { db, orgId } = await seedDb();
    try {
      const docA = await createDocumentAction(db, { orgId, projectId: null, kind: "note", title: "A", body: "a" });
      const docB = await createDocumentAction(db, { orgId, projectId: null, kind: "note", title: "B", body: "links to [[A]]" });
      await upsertDocLink(db, { orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      const backlinks = await getBacklinks(db, docA.id);
      expect(backlinks).toHaveLength(1);
      expect(backlinks[0]!.source_doc_id).toBe(docB.id);
      expect(backlinks[0]!.title).toBe("B");
    } finally {
      await db.close();
    }
  });

  test("upsert is idempotent", async () => {
    const { db, orgId } = await seedDb();
    try {
      const docA = await createDocumentAction(db, { orgId, projectId: null, kind: "note", title: "A", body: "a" });
      const docB = await createDocumentAction(db, { orgId, projectId: null, kind: "note", title: "B", body: "b" });
      await upsertDocLink(db, { orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      await upsertDocLink(db, { orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      const backlinks = await getBacklinks(db, docA.id);
      expect(backlinks).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("getBacklinks returns empty array when no links", async () => {
    const { db, orgId } = await seedDb();
    try {
      const doc = await createDocumentAction(db, { orgId, projectId: null, kind: "note", title: "Lonely", body: "x" });
      const backlinks = await getBacklinks(db, doc.id);
      expect(backlinks).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
