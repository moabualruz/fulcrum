import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../../../test-support/product-fixtures.ts";
import { createDocumentAction, updateDocumentAction } from "../../../../lib/server/documents.ts";
import {
  createDocumentVersion,
  listDocumentVersions,
  restoreDocumentVersion,
  getNextVersionNumber,
} from "../../../../lib/server/doc-versions.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-docs-history-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function openDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  return db;
}

describe("/docs/[id]/history server logic", () => {
  test("version timeline shows DESC order with author + timestamps", async () => {
    const db = await openDb();
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const doc = await createDocumentAction(db, {
        orgId: org.id, projectId: null, kind: "note", title: "T v1", body: "b v1",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId: org.id, version: 1, title: "T v1", body: "b v1",
        frontmatter: {}, author: "user",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId: org.id, version: 2, title: "T v2", body: "b v2",
        frontmatter: {}, author: "agent",
      });
      const versions = await listDocumentVersions(db, doc.id);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.version).toBe(2);
      expect(versions[0]!.author).toBe("agent");
      expect(versions[1]!.version).toBe(1);
      expect(versions[1]!.author).toBe("user");
      expect(versions[0]!.created_at).toBeTruthy();
    } finally {
      await db.close();
    }
  });

  test("restore rolls back document content and getNextVersionNumber increments", async () => {
    const db = await openDb();
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const doc = await createDocumentAction(db, {
        orgId: org.id, projectId: null, kind: "note", title: "Original", body: "original",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId: org.id, version: 1, title: "Original", body: "original",
        frontmatter: {}, author: "user",
      });
      await updateDocumentAction(db, {
        id: doc.id, orgId: org.id, title: "Changed", body: "changed",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId: org.id, version: 2, title: "Changed", body: "changed",
        frontmatter: {}, author: "user",
      });
      const nextVer = await getNextVersionNumber(db, doc.id);
      expect(nextVer).toBe(3);
      await restoreDocumentVersion(db, doc.id, org.id, 1);
      const rows = await db.query<{ title: string; body: string }>(
        `SELECT title, body FROM documents WHERE id = $1`, [doc.id],
      );
      expect(rows[0]!.title).toBe("Original");
      expect(rows[0]!.body).toBe("original");
    } finally {
      await db.close();
    }
  });

  test("5 versions visible in listing", async () => {
    const db = await openDb();
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const doc = await createDocumentAction(db, {
        orgId: org.id, projectId: null, kind: "note", title: "T", body: "b",
      });
      for (let i = 1; i <= 5; i++) {
        await createDocumentVersion(db, {
          docId: doc.id, orgId: org.id, version: i, title: `T v${i}`, body: `b v${i}`,
          frontmatter: {}, author: "user",
        });
      }
      const versions = await listDocumentVersions(db, doc.id);
      expect(versions).toHaveLength(5);
    } finally {
      await db.close();
    }
  });
});
