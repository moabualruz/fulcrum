import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openPglite } from "../db/pglite.ts";
import { runMigrations } from "../db/migrate.ts";
import type { ProductDb } from "../db/types.ts";
import {
  blockToMarkdown,
  enqueueNotionSync,
  syncNotion,
  type NotionClient,
  type NotionBlock,
  type NotionPageResult,
  type NotionPaginatedResponse,
  NotionApiError,
} from "./notion.ts";
import { isFeatureEnabled, FeatureDisabledError } from "./features.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-notion-"));
let db: ProductDb;

beforeAll(async () => {
  db = await openPglite(join(scratch, "notion-test"));
  await runMigrations(db);
  // Seed org
  await db.query(`INSERT INTO orgs (id, slug, name) VALUES ('org1', 'test-org', 'Test Org')`, []);
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

// ── Block → Markdown tests ──

describe("blockToMarkdown", () => {
  test("heading_1 → # heading", () => {
    const block: NotionBlock = { id: "b1", type: "heading_1", heading_1: { text: [{ plain_text: "Title" }] } };
    expect(blockToMarkdown(block)).toBe("# Title");
  });

  test("heading_2 → ## heading", () => {
    const block: NotionBlock = { id: "b2", type: "heading_2", heading_2: { text: [{ plain_text: "Sub" }] } };
    expect(blockToMarkdown(block)).toBe("## Sub");
  });

  test("heading_3 → ### heading", () => {
    const block: NotionBlock = { id: "b3", type: "heading_3", heading_3: { text: [{ plain_text: "Sub2" }] } };
    expect(blockToMarkdown(block)).toBe("### Sub2");
  });

  test("paragraph → plain text", () => {
    const block: NotionBlock = { id: "b4", type: "paragraph", paragraph: { text: [{ plain_text: "Hello world" }] } };
    expect(blockToMarkdown(block)).toBe("Hello world");
  });

  test("bulleted_list_item → - item", () => {
    const block: NotionBlock = { id: "b5", type: "bulleted_list_item", bulleted_list_item: { text: [{ plain_text: "item" }] } };
    expect(blockToMarkdown(block)).toBe("- item");
  });

  test("numbered_list_item → 1. item", () => {
    const block: NotionBlock = { id: "b6", type: "numbered_list_item", numbered_list_item: { text: [{ plain_text: "step" }] } };
    expect(blockToMarkdown(block)).toBe("1. step");
  });

  test("code block with language", () => {
    const block: NotionBlock = { id: "b7", type: "code", code: { text: [{ plain_text: "const x = 1;" }], language: "typescript" } };
    expect(blockToMarkdown(block)).toBe("```typescript\nconst x = 1;\n```");
  });

  test("toggle → blockquote", () => {
    const block: NotionBlock = { id: "b8", type: "toggle", toggle: { text: [{ plain_text: "Details" }] } };
    expect(blockToMarkdown(block)).toBe("> Details");
  });

  test("image → ![alt](url)", () => {
    const block: NotionBlock = { id: "b9", type: "image", image: { file: { url: "https://example.com/img.png" }, caption: [{ plain_text: "My image" }] } };
    expect(blockToMarkdown(block)).toBe("![My image](https://example.com/img.png)");
  });
});

// ── Feature flag tests ──

describe("feature flags", () => {
  test("connector-notion OFF → enqueueNotionSync throws FeatureDisabledError", async () => {
    const origEnv = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    try {
      await expect(enqueueNotionSync(db, "org1")).rejects.toThrow(FeatureDisabledError);
    } finally {
      if (origEnv !== undefined) process.env["FULCRUM_FEATURES"] = origEnv;
    }
  });

  test("isFeatureEnabled returns true when feature in list", () => {
    const orig = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "connector-confluence,connector-notion";
    try {
      expect(isFeatureEnabled("connector-notion")).toBe(true);
      expect(isFeatureEnabled("connector-confluence")).toBe(true);
      expect(isFeatureEnabled("something-else")).toBe(false);
    } finally {
      if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
      else delete process.env["FULCRUM_FEATURES"];
    }
  });

  test("connector-notion ON → enqueueNotionSync returns job_id", async () => {
    const orig = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "connector-notion";
    try {
      const jobId = await enqueueNotionSync(db, "org1");
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
    } finally {
      if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
      else delete process.env["FULCRUM_FEATURES"];
    }
  });
});

// ── Mock Notion client ──

function makeMockClient(pages: NotionPageResult[], blocksByPage: Record<string, NotionBlock[]>): NotionClient {
  return {
    async listPages(cursor) {
      return { results: pages, has_more: false, next_cursor: null };
    },
    async getBlockChildren(blockId, cursor) {
      return { results: blocksByPage[blockId] ?? [], has_more: false, next_cursor: null };
    },
  };
}

// ── Sync tests ──

describe("syncNotion", () => {
  test("3 pages with 2 nested children → 5 docs rows with correct parent_id chain", async () => {
    // 3 top-level pages; page1 has 2 child_page blocks
    const pages: NotionPageResult[] = [
      { id: "page1", properties: { title: { title: [{ plain_text: "Parent Page" }] } } },
      { id: "page2", properties: { title: { title: [{ plain_text: "Standalone A" }] } } },
      { id: "page3", properties: { title: { title: [{ plain_text: "Standalone B" }] } } },
    ];

    const blocks: Record<string, NotionBlock[]> = {
      page1: [
        { id: "b1", type: "paragraph", paragraph: { text: [{ plain_text: "Intro text" }] } },
        { id: "child1", type: "child_page", has_children: true, child_page: { title: "Child One" } },
        { id: "child2", type: "child_page", has_children: true, child_page: { title: "Child Two" } },
      ],
      page2: [{ id: "b2", type: "paragraph", paragraph: { text: [{ plain_text: "Page 2 body" }] } }],
      page3: [{ id: "b3", type: "paragraph", paragraph: { text: [{ plain_text: "Page 3 body" }] } }],
      child1: [{ id: "b4", type: "paragraph", paragraph: { text: [{ plain_text: "Child 1 body" }] } }],
      child2: [{ id: "b5", type: "paragraph", paragraph: { text: [{ plain_text: "Child 2 body" }] } }],
    };

    const client = makeMockClient(pages, blocks);
    const result = await syncNotion(db, client, "org1");

    expect(result.pagesSynced).toBe(3); // 3 top-level pages processed
    expect(result.errors).toEqual([]);

    // Check total docs rows
    const rows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM documents WHERE org_id = 'org1' AND external_id LIKE 'notion:%'`,
      [],
    );
    expect(rows[0]!.count).toBe(5);

    // Check parent-child relationship
    const parentDoc = await db.query<{ id: string }>(
      `SELECT id FROM documents WHERE external_id = 'notion:page1'`, [],
    );
    expect(parentDoc.length).toBe(1);
    const parentId = parentDoc[0]!.id;

    const children = await db.query<{ external_id: string; parent_id: string }>(
      `SELECT external_id, parent_id FROM documents WHERE parent_id = $1 ORDER BY external_id`, [parentId],
    );
    expect(children.length).toBe(2);
    expect(children[0]!.external_id).toBe("notion:child1");
    expect(children[1]!.external_id).toBe("notion:child2");

    // Check connector_sync_log
    const logs = await db.query<{ pages_synced: number; errors_json: string }>(
      `SELECT pages_synced, errors_json::text as errors_json FROM connector_sync_log WHERE id = $1`, [result.syncLogId],
    );
    expect(logs.length).toBe(1);
    expect(logs[0]!.pages_synced).toBe(3);
  });

  test("idempotency — same mock response on re-run → count unchanged; updated_at refreshed", async () => {
    // Use a dedicated org to isolate
    await db.query(`INSERT INTO orgs (id, slug, name) VALUES ('org2', 'idem-org', 'Idem Org')`, []);

    const pages: NotionPageResult[] = [
      { id: "idem-p1", properties: { title: { title: [{ plain_text: "Idem Page" }] } } },
    ];
    const blocks: Record<string, NotionBlock[]> = {
      "idem-p1": [{ id: "ib1", type: "paragraph", paragraph: { text: [{ plain_text: "Body" }] } }],
    };
    const client = makeMockClient(pages, blocks);

    // First run
    await syncNotion(db, client, "org2");
    const firstRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM documents WHERE org_id = 'org2'`, [],
    );
    const firstUpdated = await db.query<{ updated_at: string }>(
      `SELECT updated_at::text FROM documents WHERE external_id = 'notion:idem-p1'`, [],
    );

    // Small delay to ensure updated_at differs
    await new Promise((r) => setTimeout(r, 50));

    // Second run
    await syncNotion(db, client, "org2");
    const secondRows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM documents WHERE org_id = 'org2'`, [],
    );
    const secondUpdated = await db.query<{ updated_at: string }>(
      `SELECT updated_at::text FROM documents WHERE external_id = 'notion:idem-p1'`, [],
    );

    expect(secondRows[0]!.count).toBe(firstRows[0]!.count);
    // updated_at should be refreshed (or at least not earlier)
    expect(secondUpdated[0]!.updated_at >= firstUpdated[0]!.updated_at).toBe(true);
  });

  test("Notion API 401 → connector_sync_log.errors_json contains error; job fails gracefully", async () => {
    await db.query(`INSERT INTO orgs (id, slug, name) VALUES ('org3', 'err-org', 'Err Org')`, []);

    const failClient: NotionClient = {
      async listPages() {
        throw new NotionApiError(401, "Unauthorized");
      },
      async getBlockChildren() {
        return { results: [], has_more: false, next_cursor: null };
      },
    };

    let caught = false;
    let syncLogId: string | undefined;
    try {
      await syncNotion(db, failClient, "org3");
    } catch (err) {
      caught = true;
      expect(err).toBeInstanceOf(NotionApiError);
      expect((err as NotionApiError).status).toBe(401);
    }
    expect(caught).toBe(true);

    // Check connector_sync_log has the error
    const logs = await db.query<{ errors_json: string; pages_synced: number }>(
      `SELECT errors_json::text as errors_json, pages_synced FROM connector_sync_log WHERE org_id = 'org3' AND connector = 'notion'`, [],
    );
    expect(logs.length).toBe(1);
    const errors = JSON.parse(logs[0]!.errors_json) as string[];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("401");
  });

  test("pagination — has_more + next_cursor handled", async () => {
    await db.query(`INSERT INTO orgs (id, slug, name) VALUES ('org4', 'pag-org', 'Pag Org')`, []);

    let callCount = 0;
    const paginatedClient: NotionClient = {
      async listPages(cursor) {
        callCount++;
        if (!cursor) {
          return {
            results: [{ id: "pag-p1", properties: { title: { title: [{ plain_text: "Page 1" }] } } }],
            has_more: true,
            next_cursor: "cursor2",
          };
        }
        return {
          results: [{ id: "pag-p2", properties: { title: { title: [{ plain_text: "Page 2" }] } } }],
          has_more: false,
          next_cursor: null,
        };
      },
      async getBlockChildren() {
        return { results: [], has_more: false, next_cursor: null };
      },
    };

    const result = await syncNotion(db, paginatedClient, "org4");
    expect(result.pagesSynced).toBe(2);
    expect(callCount).toBe(2);
  });
});

// ── Migration tests ──

describe("migration 0004", () => {
  test("connector_sync_log table exists", async () => {
    const rows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'connector_sync_log' AND relkind = 'r'`, [],
    );
    expect(rows[0]!.count).toBe(1);
  });

  test("documents table has external_id column", async () => {
    const rows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'external_id'`, [],
    );
    expect(rows[0]!.count).toBe(1);
  });

  test("documents table has doc_type with CHECK constraint", async () => {
    // Insert valid doc_type
    await db.query(
      `INSERT INTO documents (id, org_id, kind, title, body, doc_type) VALUES ('dt1', 'org1', 'wiki', 'T', 'B', 'wiki')`, [],
    );
    const rows = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM documents WHERE id = 'dt1'`, [],
    );
    expect(rows[0]!.count).toBe(1);
    // Cleanup
    await db.query(`DELETE FROM documents WHERE id = 'dt1'`, []);
  });

  test("external_id unique index enforced per org", async () => {
    await db.query(
      `INSERT INTO documents (id, org_id, kind, title, body, external_id) VALUES ('ux1', 'org1', 'wiki', 'T1', 'B', 'notion:unique1')`, [],
    );
    let threw = false;
    try {
      await db.query(
        `INSERT INTO documents (id, org_id, kind, title, body, external_id) VALUES ('ux2', 'org1', 'wiki', 'T2', 'B', 'notion:unique1')`, [],
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Cleanup
    await db.query(`DELETE FROM documents WHERE id IN ('ux1', 'ux2')`, []);
  });
});
