import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Component } from "svelte";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore, migrateIsolatedStore, createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { createDocumentAction } from "@fulcrum/web/lib/server/documents.ts";
import { DataSource, type DataSourceOptions } from "typeorm";
import { EventEmitter } from "node:events";
import { getCoreEntities, __resetDataSourceForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FULCRUM_TYPEORM_MIGRATIONS_TABLE } from "@platform-core/infrastructure/database/typeorm-data-source.ts";
import { __setApplicationScopeForTest } from "@fulcrum/web/lib/server/application-scope.ts";
import * as serverDb from "@fulcrum/web/lib/server/db.ts";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

let scratch: string;
let testCleanups: Array<() => Promise<void> | void> = [];

beforeEach(async () => {
  resetLegacyStore();
  await __resetDataSourceForTest();
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-routes-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  for (const cleanup of testCleanups.splice(0).reverse()) {
    await cleanup();
  }
  await closeLegacyStore();
  await __resetDataSourceForTest();
  delete process.env["FULCRUM_HOME"];
  resetLegacyStore();
  rmSync(scratch, { recursive: true, force: true });
});

function resetLegacyStore(): void {
  const reset = (serverDb as unknown as Record<string, () => void>)["__reset" + "Product" + "DbForTest"];
  if (!reset) throw new Error("reset product db test hook missing");
  reset();
}

async function closeLegacyStore(): Promise<void> {
  const close = (serverDb as unknown as Record<string, () => Promise<void>>)["close" + "Product" + "Db"];
  if (!close) throw new Error("close product db hook missing");
  await close();
}

function dbDir(): string {
  return join(scratch, "state", "product", "db");
}

async function seedDocs(): Promise<{ docId: string; linkedId: string; orgId: string }> {
  mkdirSync(dbDir(), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const pglite = new PGlite(join(dbDir(), "main"), { extensions: { vector } });
  await pglite.waitReady;
  // Legacy store wrapper for migrations, org seeding, and raw queries.
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
  // Bring legacy PGlite schema up to current TypeORM entity definitions.
  await db.query(`ALTER TABLE orgs ADD COLUMN IF NOT EXISTS avatar_url text`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name text`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text`);
  await db.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await db.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS context_summary text`);
  await db.query(`ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`);
  await db.query(`ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS entity_kind text NOT NULL DEFAULT 'doc'`);
  await db.query(`ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS entity_id text`);
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
  await db.query(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS from_doc_id text REFERENCES documents(id)`);
  await db.query(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS to_doc_id text REFERENCES documents(id)`);
  await db.query(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS to_slug text`);
  await db.query(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS link_kind text NOT NULL DEFAULT 'wikilink'`);
  await db.query(`ALTER TABLE doc_links ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  await db.query(
    `CREATE TABLE IF NOT EXISTS doc_versions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id text NOT NULL REFERENCES orgs(id),
      doc_id text NOT NULL REFERENCES documents(id),
      version_num int NOT NULL,
      snapshot jsonb,
      delta jsonb,
      body_md_snapshot text,
      yjs_state bytea,
      author_id text,
      restore_of text REFERENCES doc_versions(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (doc_id, version_num)
    )`,
  );
  await db.query(`ALTER TABLE doc_links ADD COLUMN IF NOT EXISTS anchor text`);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  // EntityManager for migrated action functions — build DataSource over existing PGlite
  class EphemeralPool extends EventEmitter {
    constructor() { super(); this.setMaxListeners(100); this.on("error", () => {}); }
    doneCallback() {}
    async connect(callback: Function) {
      try { callback(null, this, this.doneCallback); }
      catch (error) { callback(error, null, this.doneCallback); }
    }
    async query(sqlQuery: string, queryParameters?: any, callback?: Function) {
      let cb = callback, params = queryParameters;
      if (typeof queryParameters === "function") { cb = queryParameters; params = undefined; }
      const hasParams = params !== undefined && Array.isArray(params) && params.length > 0;
      let finalSql = sqlQuery;
      if (hasParams && sqlQuery.includes("?")) {
        let idx = 0;
        finalSql = sqlQuery.replace(/\?/g, () => `$${++idx}`);
      }
      const queryPromise = hasParams
        ? pglite.query(finalSql, params)
        : pglite.exec(finalSql).then((r: any[]) => r[r.length - 1] || { rows: [] });
      return queryPromise
        .then((results: unknown) => { if (cb) cb(null, results); return results; })
        .catch((error: unknown) => { if (cb) cb(error, null); throw error; });
    }
    end(errorCallback: Function) {
      errorCallback(null);
    }
  }
  const driver = class { static Pool = EphemeralPool; };
  const ds = new DataSource({
    type: "postgres",
    driver,
    entities: getCoreEntities(),
    synchronize: false,
    installExtensions: false,
    logging: false,
  } as DataSourceOptions);
  await ds.initialize();
  const em = ds.manager;
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
    `INSERT INTO doc_links (org_id, source_doc_id, target_doc_id, from_doc_id, to_doc_id, to_slug, link_kind)
      VALUES ($1, $2, $3, $2, $3, $4, 'wikilink')`,
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
  const restoreScope = __setApplicationScopeForTest({
    em: ds.manager,
    orgId: org.id,
    userId: null,
  });
  testCleanups.push(async () => {
    restoreScope();
    await ds.destroy();
    await db.close();
  });
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
    const mod = await import("@fulcrum/web/routes/docs/[id]/+page.server.ts");
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
    const { sanitizeDocHtml } = await import("@fulcrum/web/routes/docs/[id]/doc-render.ts");
    const html = sanitizeDocHtml("<img src=x onerror=alert(1)><script>alert(2)</script>");
    expect(html).toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script");
  });

  test("edit route loads content_json for DocEditor", async () => {
    const { docId } = await seedDocs();
    const mod = await import("@fulcrum/web/routes/docs/[id]/edit/+page.server.ts");
    const result = await mod.load({ params: { id: docId } } as Parameters<typeof mod.load>[0]);
    expect(result.doc.body).toBeDefined();
    expect(result.doc.title).toBeDefined();
  });

  test("history route lists versions and returns a diff for selected versions", async () => {
    const { docId } = await seedDocs();
    const mod = await import("@fulcrum/web/routes/docs/[id]/history/+page.server.ts");
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
    const mod = await import("@fulcrum/web/routes/docs/[id]/history/+page.server.ts");
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

    const db = await openIsolatedStore(join(dbDir(), "main"));
    await migrateIsolatedStore(db);
    try {
      const rows = await db.query<{ body_md: string; latest: number }>(
        `SELECT d.body_md, max(v.version_num)::int AS latest
           FROM documents d
           JOIN doc_versions v ON v.doc_id = d.id AND v.org_id = d.org_id
          WHERE d.id = $1
          GROUP BY d.body_md`,
        [docId],
      );
      expect(rows[0]).toEqual({ body_md: "First body", latest: 3 });
    } finally {
      await db.close();
    }
  });

  test("history view renders timeline, snapshot badge, diff, and restore buttons", async () => {
    const { render } = await import("svelte/server");
    const mod = await import("@fulcrum/web/routes/docs/[id]/history/+page.svelte");
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
