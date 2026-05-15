import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityManager } from "typeorm";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
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

async function seedDb(): Promise<{ em: EntityManager; orgId: string; close: () => Promise<void> }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const pglite = new PGlite(join(dbDir, "main"), { extensions: { vector } });
  await pglite.waitReady;
  const db = {
    engine: "pglite" as const,
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const result = await pglite.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async exec(sql: string) { await pglite.exec(sql); },
    async close() { await pglite.close(); },
  };
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const orm = await initDataSource({ pglite });
  const em = orm.em;
  return {
    em, orgId: org.id,
    async close() { await orm.close(true); await db.close(); },
  };
}

describe("doc links", () => {
  test("upsertDocLink creates a link and getBacklinks returns it", async () => {
    const ctx = await seedDb();
    try {
      const docA = await createDocumentAction(ctx.em, { orgId: ctx.orgId, projectId: null, kind: "note", title: "A", body: "a" });
      const docB = await createDocumentAction(ctx.em, { orgId: ctx.orgId, projectId: null, kind: "note", title: "B", body: "links to [[A]]" });
      await upsertDocLink(ctx.em, { orgId: ctx.orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      const backlinks = await getBacklinks(ctx.em, docA.id);
      expect(backlinks).toHaveLength(1);
      expect(backlinks[0]!.source_doc_id).toBe(docB.id);
      expect(backlinks[0]!.title).toBe("B");
    } finally {
      await ctx.close();
    }
  });

  test("upsert is idempotent", async () => {
    const ctx = await seedDb();
    try {
      const docA = await createDocumentAction(ctx.em, { orgId: ctx.orgId, projectId: null, kind: "note", title: "A", body: "a" });
      const docB = await createDocumentAction(ctx.em, { orgId: ctx.orgId, projectId: null, kind: "note", title: "B", body: "b" });
      await upsertDocLink(ctx.em, { orgId: ctx.orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      await upsertDocLink(ctx.em, { orgId: ctx.orgId, sourceDocId: docB.id, targetDocId: docA.id, linkType: "wikilink" });
      const backlinks = await getBacklinks(ctx.em, docA.id);
      expect(backlinks).toHaveLength(1);
    } finally {
      await ctx.close();
    }
  });

  test("getBacklinks returns empty array when no links", async () => {
    const ctx = await seedDb();
    try {
      const doc = await createDocumentAction(ctx.em, { orgId: ctx.orgId, projectId: null, kind: "note", title: "Lonely", body: "x" });
      const backlinks = await getBacklinks(ctx.em, doc.id);
      expect(backlinks).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
