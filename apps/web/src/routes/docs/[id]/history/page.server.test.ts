import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
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
  return createTestOrm();
}

function em(db: TestOrm) {
  return db.em;
}

describe("/docs/[id]/history server logic", () => {
  test("version timeline shows DESC order with author + timestamps", async () => {
    const db = await openDb();
    try {
      const doc = await createDocumentAction(em(db), {
        orgId: db.seed.orgId, projectId: null, kind: "note", title: "T v1", body: "b v1",
      });
      await createDocumentVersion(em(db), {
        docId: doc.id, orgId: db.seed.orgId, version: 1, title: "T v1", body: "b v1",
        frontmatter: {}, author: "user",
      });
      await createDocumentVersion(em(db), {
        docId: doc.id, orgId: db.seed.orgId, version: 2, title: "T v2", body: "b v2",
        frontmatter: {}, author: "agent",
      });
      const versions = await listDocumentVersions(em(db), doc.id);
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
      const doc = await createDocumentAction(em(db), {
        orgId: db.seed.orgId, projectId: null, kind: "note", title: "Original", body: "original",
      });
      await createDocumentVersion(em(db), {
        docId: doc.id, orgId: db.seed.orgId, version: 1, title: "Original", body: "original",
        frontmatter: {}, author: "user",
      });
      await updateDocumentAction(em(db), {
        id: doc.id, orgId: db.seed.orgId, title: "Changed", body: "changed",
      });
      await createDocumentVersion(em(db), {
        docId: doc.id, orgId: db.seed.orgId, version: 2, title: "Changed", body: "changed",
        frontmatter: {}, author: "user",
      });
      const nextVer = await getNextVersionNumber(em(db), doc.id);
      expect(nextVer).toBe(3);
      await restoreDocumentVersion(em(db), doc.id, db.seed.orgId, 1);
      const rows = await em(db).getConnection().execute<{ title: string; body: string }[]>(
        `SELECT title, body_md AS body FROM documents WHERE id = ?`, [doc.id],
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
      const doc = await createDocumentAction(em(db), {
        orgId: db.seed.orgId, projectId: null, kind: "note", title: "T", body: "b",
      });
      for (let i = 1; i <= 5; i++) {
        await createDocumentVersion(em(db), {
          docId: doc.id, orgId: db.seed.orgId, version: i, title: `T v${i}`, body: `b v${i}`,
          frontmatter: {}, author: "user",
        });
      }
      const versions = await listDocumentVersions(em(db), doc.id);
      expect(versions).toHaveLength(5);
    } finally {
      await db.close();
    }
  });
});
