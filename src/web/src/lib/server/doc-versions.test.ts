import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../test-support/product-fixtures.ts";
import { createDocumentAction, updateDocumentAction } from "./documents";
import {
  createDocumentVersion,
  listDocumentVersions,
  getDocumentVersion,
  restoreDocumentVersion,
} from "./doc-versions";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-versions-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

describe("document versions", () => {
  test("createDocumentVersion records version 1", async () => {
    const { db, orgId } = await seedDb();
    try {
      const doc = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "V1 Title",
        body: "V1 body",
      });
      const ver = await createDocumentVersion(db, {
        docId: doc.id,
        orgId,
        version: 1,
        title: "V1 Title",
        body: "V1 body",
        frontmatter: {},
        author: "user",
      });
      expect(ver.id).toBeTruthy();
      expect(ver.version).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("listDocumentVersions returns versions in DESC order", async () => {
    const { db, orgId } = await seedDb();
    try {
      const doc = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "Title",
        body: "body v1",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 1, title: "Title", body: "body v1", frontmatter: {}, author: "user",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 2, title: "Title v2", body: "body v2", frontmatter: {}, author: "user",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 3, title: "Title v3", body: "body v3", frontmatter: {}, author: "agent",
      });
      const versions = await listDocumentVersions(db, doc.id);
      expect(versions).toHaveLength(3);
      expect(versions[0]!.version).toBe(3);
      expect(versions[1]!.version).toBe(2);
      expect(versions[2]!.version).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("getDocumentVersion returns a specific version", async () => {
    const { db, orgId } = await seedDb();
    try {
      const doc = await createDocumentAction(db, {
        orgId, projectId: null, kind: "note", title: "T", body: "b",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 1, title: "T", body: "b", frontmatter: {}, author: "user",
      });
      const ver = await getDocumentVersion(db, doc.id, 1);
      expect(ver).toBeDefined();
      expect(ver!.title).toBe("T");
      expect(ver!.body).toBe("b");
    } finally {
      await db.close();
    }
  });

  test("restoreDocumentVersion rolls back document content", async () => {
    const { db, orgId } = await seedDb();
    try {
      const doc = await createDocumentAction(db, {
        orgId, projectId: null, kind: "note", title: "Original", body: "original body",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 1, title: "Original", body: "original body", frontmatter: {}, author: "user",
      });
      await updateDocumentAction(db, {
        id: doc.id, orgId, title: "Changed", body: "changed body",
      });
      await createDocumentVersion(db, {
        docId: doc.id, orgId, version: 2, title: "Changed", body: "changed body", frontmatter: {}, author: "user",
      });
      // Restore version 1
      await restoreDocumentVersion(db, doc.id, orgId, 1);
      const rows = await db.query<{ title: string; body: string }>(
        `SELECT title, body FROM documents WHERE id = $1`, [doc.id],
      );
      expect(rows[0]!.title).toBe("Original");
      expect(rows[0]!.body).toBe("original body");
    } finally {
      await db.close();
    }
  });
});
