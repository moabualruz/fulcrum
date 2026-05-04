import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Component } from "svelte";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openPglite } from "../../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../../src/product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../src/product-kernel/store/repositories.ts";
import { createDocumentAction } from "../../src/web/src/lib/server/documents.ts";
import { initOrm } from "../../src/db/mikro-orm.config.ts";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-routes-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function dbDir(): string {
  return join(scratch, "state", "product", "db");
}

async function seedDocs(): Promise<{ docId: string; linkedId: string; orgId: string }> {
  mkdirSync(dbDir(), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const pglite = new PGlite(join(dbDir(), "main"), { extensions: { vector } });
  await pglite.waitReady;
  // ProductDb wrapper for legacy code (runMigrations, createLocalOrg, raw queries)
  const db = {
    engine: "pglite" as const,
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const result = await pglite.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async exec(sql: string) { await pglite.exec(sql); },
    async close() { await pglite.close(); },
  };
  await runMigrations(db);
  await db.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await db.query(
    `CREATE TABLE IF NOT EXISTS doc_links (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id text NOT NULL REFERENCES orgs(id),
      from_doc_id text NOT NULL REFERENCES documents(id),
      to_doc_id text REFERENCES documents(id),
      to_slug text NOT NULL,
      link_kind text NOT NULL DEFAULT 'wikilink',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS doc_versions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id text NOT NULL REFERENCES orgs(id),
      doc_id text NOT NULL REFERENCES documents(id),
      version_num int NOT NULL,
      snapshot jsonb,
      body_md_snapshot text,
      restore_of text REFERENCES doc_versions(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (doc_id, version_num)
    )`,
  );
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  // EntityManager for migrated action functions
  const orm = await initOrm({ pglite });
  const em = orm.em.fork();
  const linked = await createDocumentAction(em, {
    orgId: org.id,
    projectId: null,
    kind: "note",
    title: "Linked Doc",
    body: "Linked body",
    frontmatter: { title: "Linked Doc", kind: "note" },
  });
  const created = await createDocumentAction(em, {
    orgId: org.id,
    projectId: null,
    kind: "adr",
    title: "ADR 1",
    body: "See [[linked-doc]].\n\n```ts\nconst ok = true;\n```\n\n<img src=x onerror=alert(1)><script>alert(2)</script>",
    frontmatter: { title: "ADR 1", kind: "adr", status: "accepted" },
  });
  await db.query(
    `UPDATE documents
        SET content_json = $3::jsonb
      WHERE id = $1 AND org_id = $2`,
    [
      created.id,
      org.id,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "loaded json" }] }] }),
    ],
  );
  await db.query(
    `INSERT INTO doc_links (org_id, from_doc_id, to_doc_id, to_slug, link_kind)
      VALUES ($1, $2, $3, $4, 'wikilink')`,
    [org.id, linked.id, created.id, "adr-1"],
  );
  await db.query(
    `INSERT INTO doc_versions (org_id, doc_id, version_num, snapshot, body_md_snapshot, created_at)
      VALUES
        ($1, $2, 1, $3::jsonb, 'First body', now() - interval '2 hours'),
        ($1, $2, 2, $4::jsonb, 'Second body', now() - interval '1 hour')`,
    [
      org.id,
      created.id,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First body" }] }] }),
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Second body" }] }] }),
    ],
  );
  await orm.close(true);
  await db.close();
  return { docId: created.id, linkedId: linked.id, orgId: org.id };
}

async function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

describe("docs read/edit/history routes", () => {
  test("read route returns sanitized rendered HTML, wikilink chips, frontmatter, and backlinks", async () => {
    const { docId, linkedId } = await seedDocs();
    const mod = await import("../../src/web/src/routes/docs/[id]/+page.server.ts");
    const result = await mod.load({ params: { id: docId }, locals: {} } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{
      doc: {
        renderedHtml: string;
        frontmatter: Record<string, unknown>;
      };
      backlinks: Array<{ id: string; title: string; href: string }>;
    }>(result);

    expect(payload.doc.renderedHtml).toContain("language-ts");
    expect(payload.doc.renderedHtml).toContain('data-wikilink-chip="linked-doc"');
    expect(payload.doc.renderedHtml).toContain('href="/docs/linked-doc"');
    expect(payload.doc.renderedHtml).not.toContain("<script");
    expect(payload.doc.renderedHtml).not.toContain("onerror");
    expect(payload.doc.frontmatter.status).toBe("accepted");
    expect(payload.backlinks).toEqual([{ id: linkedId, title: "Linked Doc", href: `/docs/${linkedId}` }]);
  });

  test("sanitizeDocHtml strips script tags and event handler attrs", async () => {
    const { sanitizeDocHtml } = await import("../../src/web/src/routes/docs/[id]/doc-render.ts");
    const html = sanitizeDocHtml("<img src=x onerror=alert(1)><script>alert(2)</script>");
    expect(html).toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script");
  });

  test("edit route loads content_json for DocEditor", async () => {
    const { docId } = await seedDocs();
    const mod = await import("../../src/web/src/routes/docs/[id]/edit/+page.server.ts");
    const result = await mod.load({ params: { id: docId } } as Parameters<typeof mod.load>[0]);
    expect(result.doc.contentJson).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "loaded json" }] }],
    });
  });

  test("history route lists versions and returns a diff for selected versions", async () => {
    const { docId } = await seedDocs();
    const mod = await import("../../src/web/src/routes/docs/[id]/history/+page.server.ts");
    const result = await mod.load({
      params: { id: docId },
      url: new URL(`http://localhost/docs/${docId}/history?from=1&to=2`),
    } as Parameters<typeof mod.load>[0]);
    expect(result.doc.id).toBe(docId);
    expect(result.versions.map((version: { versionNum: number; isSnapshot: boolean }) => [
      version.versionNum,
      version.isSnapshot,
    ])).toEqual([[2, true], [1, true]]);
    expect(result.diffHtml).toContain("First body");
    expect(result.diffHtml).toContain("Second body");
  });

  test("history restore creates a new version and redirects to read view", async () => {
    const { docId } = await seedDocs();
    const mod = await import("../../src/web/src/routes/docs/[id]/history/+page.server.ts");
    const fd = new FormData();
    fd.set("version_num", "1");
    let caught: unknown;
    try {
      await mod.actions.restore({
        params: { id: docId },
        request: new Request(`http://localhost/docs/${docId}/history`, { method: "POST", body: fd }),
      } as Parameters<typeof mod.actions.restore>[0]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ status: 303, location: `/docs/${docId}` });

    const db = await openPglite(join(dbDir(), "main"));
    await runMigrations(db);
    try {
      const rows = await db.query<{ body: string; latest: number }>(
        `SELECT d.body, max(v.version_num)::int AS latest
           FROM documents d
           JOIN doc_versions v ON v.doc_id = d.id AND v.org_id = d.org_id
          WHERE d.id = $1
          GROUP BY d.body`,
        [docId],
      );
      expect(rows[0]).toEqual({ body: "First body", latest: 3 });
    } finally {
      await db.close();
    }
  });

  test("history view renders timeline, snapshot badge, diff, and restore buttons", async () => {
    const { render } = await import("svelte/server");
    const mod = await import("../../src/web/src/routes/docs/[id]/history/+page.svelte");
    const Page = mod.default as Component<{
      data: {
        doc: { id: string; title: string };
        versions: Array<{ id: string; versionNum: number; isSnapshot: boolean; createdAt: string }>;
        diffHtml: string;
      };
    }>;

    const { body } = render(Page, {
      props: {
        data: {
          doc: { id: "doc-1", title: "History Doc" },
          versions: [
            { id: "v2", versionNum: 2, isSnapshot: true, createdAt: "2026-05-03T00:00:00.000Z" },
            { id: "v1", versionNum: 1, isSnapshot: true, createdAt: "2026-05-02T00:00:00.000Z" },
          ],
          diffHtml: "<del>old</del><ins>new</ins>",
        },
      },
    });

    expect(body).toContain("data-doc-history-view");
    expect(body).toContain('data-doc-version="2"');
    expect(body).toContain("data-snapshot-badge");
    expect(body).toContain("data-restore-version");
    expect(body).toContain("<del>old</del><ins>new</ins>");
  });
});
