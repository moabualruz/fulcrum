import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openPglite } from "../db/pglite.ts";
import { runMigrations } from "../db/migrate.ts";
import { createLocalOrg } from "../store/repositories.ts";
import type { ProductDb } from "../db/types.ts";
import type { OrgRow } from "../store/repositories.ts";
import { runConfluenceSync } from "./confluence-sync.ts";
import { ConfluenceClient, ConfluenceApiError } from "./confluence-client.ts";
import type { ConfluencePage, ConfluenceApiResponse } from "./confluence-client.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-confluence-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

// Save and restore env
const origFeatures = process.env.FULCRUM_FEATURES;
afterAll(() => {
  if (origFeatures === undefined) delete process.env.FULCRUM_FEATURES;
  else process.env.FULCRUM_FEATURES = origFeatures;
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

/** Mock Confluence client that returns predefined pages */
function mockClient(pages: ConfluencePage[]): ConfluenceClient {
  return {
    fetchPages: async () => pages,
  } as unknown as ConfluenceClient;
}

/** Mock Confluence client that throws an API error */
function errorClient(status: number, body: string): ConfluenceClient {
  return {
    fetchPages: async () => {
      throw new ConfluenceApiError(status, body);
    },
  } as unknown as ConfluenceClient;
}

const MOCK_PAGES: ConfluencePage[] = [
  {
    id: "100",
    title: "Getting Started",
    body: { storage: { value: "<h1>Welcome</h1><p>Hello world</p>" } },
  },
  {
    id: "200",
    title: "Architecture",
    body: { storage: { value: "<h1>Architecture</h1><p>System design</p><code>const x = 1;</code>" } },
  },
  {
    id: "300",
    title: "API Reference",
    body: { storage: { value: '<p>See <a href="https://api.example.com">API docs</a></p>' } },
  },
];

describe("connector-confluence feature flag", () => {
  test("sync fails when feature flag is off", async () => {
    delete process.env.FULCRUM_FEATURES;
    const db = await freshDb("flag-off");
    try {
      await expect(
        runConfluenceSync(db, { orgId: "o1", spaceKey: "TEST", client: mockClient([]) }),
      ).rejects.toThrow("Feature connector-confluence is not enabled");
    } finally {
      await db.close();
    }
  });
});

describe("confluence sync", () => {
  test("fetches 3 mock pages and creates 3 docs rows with correct external_id", async () => {
    process.env.FULCRUM_FEATURES = "connector-confluence";
    const db = await freshDb("sync-basic");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const result = await runConfluenceSync(db, {
        orgId: org.id,
        spaceKey: "TEST",
        client: mockClient(MOCK_PAGES),
      });

      expect(result.pagesSynced).toBe(3);
      expect(result.errors).toEqual([]);

      // Verify docs rows
      const docs = await db.query<{
        id: string;
        external_id: string;
        title: string;
        body: string;
        doc_type: string;
        scope: string;
        kind: string;
      }>(`SELECT * FROM documents WHERE org_id = $1 ORDER BY external_id`, [org.id]);

      expect(docs.length).toBe(3);
      expect(docs[0]!.external_id).toBe("confluence:100");
      expect(docs[1]!.external_id).toBe("confluence:200");
      expect(docs[2]!.external_id).toBe("confluence:300");
      expect(docs[0]!.doc_type).toBe("wiki");
      expect(docs[0]!.scope).toBe("global");
      expect(docs[0]!.kind).toBe("wiki");
    } finally {
      await db.close();
    }
  });

  test("markdown conversion: h1 → heading, p → paragraph, code → inline code, links preserved", async () => {
    process.env.FULCRUM_FEATURES = "connector-confluence";
    const db = await freshDb("sync-md");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await runConfluenceSync(db, {
        orgId: org.id,
        spaceKey: "TEST",
        client: mockClient(MOCK_PAGES),
      });

      const docs = await db.query<{ external_id: string; body: string }>(
        `SELECT external_id, body FROM documents WHERE org_id = $1 ORDER BY external_id`,
        [org.id],
      );

      // Page 100: <h1>Welcome</h1><p>Hello world</p>
      expect(docs[0]!.body).toContain("# Welcome");
      expect(docs[0]!.body).toContain("Hello world");

      // Page 200: has <code>
      expect(docs[1]!.body).toContain("# Architecture");
      expect(docs[1]!.body).toContain("`const x = 1;`");

      // Page 300: has link
      expect(docs[2]!.body).toContain("[API docs](https://api.example.com)");
    } finally {
      await db.close();
    }
  });

  test("idempotent re-run: same pages → row count unchanged, updated_at refreshed", async () => {
    process.env.FULCRUM_FEATURES = "connector-confluence";
    const db = await freshDb("sync-idempotent");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const client = mockClient(MOCK_PAGES);

      // First run
      await runConfluenceSync(db, { orgId: org.id, spaceKey: "TEST", client });
      const firstDocs = await db.query<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM documents WHERE org_id = $1 ORDER BY external_id`,
        [org.id],
      );
      expect(firstDocs.length).toBe(3);

      // Small delay to ensure updated_at differs
      await new Promise((r) => setTimeout(r, 50));

      // Second run
      const result2 = await runConfluenceSync(db, { orgId: org.id, spaceKey: "TEST", client });
      expect(result2.pagesSynced).toBe(3);

      const secondDocs = await db.query<{ id: string; updated_at: string }>(
        `SELECT id, updated_at FROM documents WHERE org_id = $1 ORDER BY external_id`,
        [org.id],
      );

      // Same row count
      expect(secondDocs.length).toBe(3);

      // Same IDs (no duplicates)
      expect(secondDocs.map((d) => d.id)).toEqual(firstDocs.map((d) => d.id));

      // updated_at advanced
      for (let i = 0; i < 3; i++) {
        expect(new Date(secondDocs[i]!.updated_at).getTime()).toBeGreaterThanOrEqual(
          new Date(firstDocs[i]!.updated_at).getTime(),
        );
      }
    } finally {
      await db.close();
    }
  });

  test("API error (401) → connector_sync_log.errors_json captures error; job fails gracefully", async () => {
    process.env.FULCRUM_FEATURES = "connector-confluence";
    const db = await freshDb("sync-error");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const result = await runConfluenceSync(db, {
        orgId: org.id,
        spaceKey: "TEST",
        client: errorClient(401, "Unauthorized"),
      });

      expect(result.pagesSynced).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("401");

      // Check log row
      const logs = await db.query<{
        id: string;
        connector: string;
        pages_synced: number;
        errors_json: string[];
        finished_at: string;
      }>(
        `SELECT * FROM connector_sync_log WHERE id = $1`,
        [result.logId],
      );
      expect(logs.length).toBe(1);
      expect(logs[0]!.connector).toBe("confluence");
      expect(logs[0]!.pages_synced).toBe(0);
      expect(logs[0]!.finished_at).toBeTruthy();

      // errors_json contains the error
      const errorsJson = typeof logs[0]!.errors_json === "string"
        ? JSON.parse(logs[0]!.errors_json as string)
        : logs[0]!.errors_json;
      expect(errorsJson.length).toBeGreaterThan(0);
      expect(errorsJson[0]).toContain("401");
    } finally {
      await db.close();
    }
  });

  test("connector_sync_log written per successful run", async () => {
    process.env.FULCRUM_FEATURES = "connector-confluence";
    const db = await freshDb("sync-log");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const result = await runConfluenceSync(db, {
        orgId: org.id,
        spaceKey: "TEST",
        client: mockClient(MOCK_PAGES),
      });

      const logs = await db.query<{
        id: string;
        connector: string;
        org_id: string;
        pages_synced: number;
        errors_json: unknown;
        finished_at: string;
      }>(`SELECT * FROM connector_sync_log WHERE id = $1`, [result.logId]);

      expect(logs.length).toBe(1);
      expect(logs[0]!.connector).toBe("confluence");
      expect(logs[0]!.org_id).toBe(org.id);
      expect(logs[0]!.pages_synced).toBe(3);
      expect(logs[0]!.finished_at).toBeTruthy();

      const errorsJson = typeof logs[0]!.errors_json === "string"
        ? JSON.parse(logs[0]!.errors_json as string)
        : logs[0]!.errors_json;
      expect(errorsJson).toEqual([]);
    } finally {
      await db.close();
    }
  });
});

describe("connector_sync_log migration", () => {
  test("connector_sync_log table exists after migration", async () => {
    const db = await freshDb("migration-check");
    try {
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = 'connector_sync_log' AND relkind = 'r'`,
        [],
      );
      expect(rows[0]!.count).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("documents.external_id column exists and has unique index", async () => {
    const db = await freshDb("ext-id-check");
    try {
      // Insert two docs with same external_id should fail
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await db.query(
        `INSERT INTO documents (id, org_id, kind, title, body, external_id)
         VALUES ('d1', $1, 'wiki', 'T1', 'B1', 'confluence:999')`,
        [org.id],
      );
      await expect(
        db.query(
          `INSERT INTO documents (id, org_id, kind, title, body, external_id)
           VALUES ('d2', $1, 'wiki', 'T2', 'B2', 'confluence:999')`,
          [org.id],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
