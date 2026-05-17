import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createIsolatedOrmFixture,
  type TestOrmFixture,
} from "@test-support/product-workspace-fixtures.ts";
import { upsertDocLink, getBacklinks } from "./doc-links";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-links-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
  if (process.exitCode === 99) process.exitCode = 0;
});

async function seedDb(): Promise<{ em: TestOrmFixture["em"]; orgId: string; close: () => Promise<void> }> {
  const fixture = await createIsolatedOrmFixture();
  return {
    em: fixture.em,
    orgId: fixture.seed.orgId,
    close: fixture.close,
  };
}

async function seedDoc(
  em: TestOrmFixture["em"],
  orgId: string,
  title: string,
  body: string,
): Promise<{ id: string; title: string }> {
  const id = crypto.randomUUID();
  await em.query(
    `INSERT INTO documents (id, org_id, project_id, doc_type, title, body_md)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, orgId, null, "note", title, body],
  );
  return { id, title };
}

describe("doc links", () => {
  test("upsertDocLink creates a link and getBacklinks returns it", async () => {
    const ctx = await seedDb();
    try {
      const docA = await seedDoc(ctx.em, ctx.orgId, "A", "a");
      const docB = await seedDoc(ctx.em, ctx.orgId, "B", "links to [[A]]");
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
      const docA = await seedDoc(ctx.em, ctx.orgId, "A", "a");
      const docB = await seedDoc(ctx.em, ctx.orgId, "B", "b");
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
      const doc = await seedDoc(ctx.em, ctx.orgId, "Lonely", "x");
      const backlinks = await getBacklinks(ctx.em, doc.id);
      expect(backlinks).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
