import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  type EventRow,
} from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import {
  createDocumentAction,
  updateDocumentAction,
  deleteDocumentAction,
} from "./documents.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-documents-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface DocumentRow {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  source_path: string | null;
  created_at: string;
  updated_at: string;
}

interface SearchDocRow {
  id: string;
  org_id: string;
  project_id: string | null;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  labels: string[];
  updated_at: string;
}

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

async function readDoc(db: TestStore, id: string): Promise<DocumentRow | undefined> {
  const rows = await db.query<DocumentRow>(`SELECT * FROM documents WHERE id = $1`, [id]);
  return rows[0];
}

async function readSearch(
  db: TestStore,
  sourceId: string,
): Promise<SearchDocRow | undefined> {
  const rows = await db.query<SearchDocRow>(
    `SELECT * FROM search_documents WHERE source_kind = 'document' AND source_id = $1`,
    [sourceId],
  );
  return rows[0];
}

async function readEventsForSubject(db: TestStore, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("server actions: documents", () => {
  test("createDocumentAction inserts row + emits document.created + indexes search_documents", async () => {
    const { db, orgId } = await freshDb("create");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "Hello",
        body: "world body",
      });
      const row = await readDoc(db, id);
      expect(row?.title).toBe("Hello");
      expect(row?.body).toBe("world body");
      expect(row?.kind).toBe("note");
      expect(row?.org_id).toBe(orgId);

      const events = await readEventsForSubject(db, id);
      const created = events.find((e) => e.verb === "created");
      expect(created?.subject_kind).toBe("document");
      expect(created?.subject_id).toBe(id);
      expect(created?.payload).toEqual({ title: "Hello", kind: "note" });

      const search = await readSearch(db, id);
      expect(search?.title).toBe("Hello");
      expect(search?.body).toBe("world body");
      expect(search?.source_kind).toBe("document");
      expect(search?.org_id).toBe(orgId);
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction title change mutates row + emits changed=['title'] + updates search_documents.title", async () => {
    const { db, orgId } = await freshDb("update-title");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "Old",
        body: "body",
      });
      const result = await updateDocumentAction(db, { id, orgId, title: "New" });
      expect(result).toEqual({ ok: true });

      const row = await readDoc(db, id);
      expect(row?.title).toBe("New");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.subject_kind).toBe("document");
      expect(updated?.payload).toEqual({ changed: ["title"] });

      const search = await readSearch(db, id);
      expect(search?.title).toBe("New");
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction body change mutates row + emits changed=['body'] + updates search_documents.body", async () => {
    const { db, orgId } = await freshDb("update-body");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "Title",
        body: "before",
      });
      await updateDocumentAction(db, { id, orgId, body: "after" });

      const row = await readDoc(db, id);
      expect(row?.body).toBe("after");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["body"] });

      const search = await readSearch(db, id);
      expect(search?.body).toBe("after");
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction kind change mutates row + emits changed=['kind']", async () => {
    const { db, orgId } = await freshDb("update-kind");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "b",
      });
      await updateDocumentAction(db, { id, orgId, kind: "spec" });

      const row = await readDoc(db, id);
      expect(row?.kind).toBe("spec");

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["kind"] });
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction frontmatter change with labels propagates to search_documents.labels", async () => {
    const { db, orgId } = await freshDb("update-fm");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "b",
      });
      await updateDocumentAction(db, {
        id,
        orgId,
        frontmatter: { labels: ["a", "b"] },
      });

      const row = await readDoc(db, id);
      expect(row?.frontmatter).toEqual({ labels: ["a", "b"] });

      const events = await readEventsForSubject(db, id);
      const updated = events.find((e) => e.verb === "updated");
      expect(updated?.payload).toEqual({ changed: ["frontmatter"] });

      const search = await readSearch(db, id);
      expect(search?.labels).toEqual(["a", "b"]);
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction throws when no fields provided", async () => {
    const { db, orgId } = await freshDb("update-none");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "b",
      });
      expect(updateDocumentAction(db, { id, orgId })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("updateDocumentAction throws when id is missing", async () => {
    const { db } = await freshDb("update-noid");
    try {
      expect(updateDocumentAction(db, { id: "", orgId: "00000000000000000000000000", title: "X" })).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("deleteDocumentAction removes document + search row + emits document.deleted", async () => {
    const { db, orgId } = await freshDb("delete-existing");
    try {
      const { id } = await createDocumentAction(db, {
        orgId,
        projectId: null,
        kind: "note",
        title: "T",
        body: "b",
      });
      const result = await deleteDocumentAction(db, id, orgId);
      expect(result).toEqual({ ok: true });

      const row = await readDoc(db, id);
      expect(row).toBeUndefined();

      const search = await readSearch(db, id);
      expect(search).toBeUndefined();

      const events = await readEventsForSubject(db, id);
      const deleted = events.find((e) => e.verb === "deleted");
      expect(deleted?.subject_kind).toBe("document");
      expect(deleted?.org_id).toBe(orgId);
    } finally {
      await db.close();
    }
  });

  test("deleteDocumentAction on missing row returns ok and emits no event", async () => {
    const { db } = await freshDb("delete-missing");
    try {
      const result = await deleteDocumentAction(db, "01J0NONEXISTENTULIDAAAAAAAA", "00000000000000000000000000");
      expect(result).toEqual({ ok: true });

      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE subject_kind = 'document' AND verb = 'deleted'`,
      );
      expect(events).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
