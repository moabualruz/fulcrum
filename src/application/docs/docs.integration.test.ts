import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { createDoc } from "./commands.ts";
import { getDoc, listDocs } from "./queries.ts";
import type { AppContext } from "./types.ts";

const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function ctx(orgId = DEFAULT_ORG_ID): AppContext {
  return { orgId, userId: "user-docs", projectId: null };
}

describe("application docs commands and queries", () => {
  test("createDoc, listDocs, and getDoc round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    const created = await createDoc(em, ctx(), {
      title: "Application docs",
      bodyMd: "# Decision\nUse application modules.",
    });

    expect(created).toMatchObject({
      orgId: DEFAULT_ORG_ID,
      title: "Application docs",
      bodyMd: "# Decision\nUse application modules.",
    });
    expect(await listDocs(em, ctx())).toHaveLength(1);
    await expect(getDoc(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("createDoc persists explicit task source links for backlinks and context source refs", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    const created = await createDoc(em, ctx(), {
      title: "Task handoff",
      bodyMd: "Implementation notes",
      links: [{ targetKind: "task", targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", linkKind: "task_ref" }],
    });

    const rows = await em.getConnection().execute<Array<{
      from_doc_id: string;
      to_doc_id: string | null;
      to_slug: string;
      link_kind: string;
    }>>(
      `select from_doc_id, to_doc_id, to_slug, link_kind
         from doc_links
        where org_id = ? and from_doc_id = ?`,
      [DEFAULT_ORG_ID, created.id],
    );

    expect(rows).toEqual([{
      from_doc_id: created.id,
      to_doc_id: null,
      to_slug: "task:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      link_kind: "task_ref",
    }]);
  });

  test("createDoc validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(createDoc(testDb.em.fork(), ctx(), { title: "" })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getDoc not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getDoc(testDb.em.fork(), ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org doc access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    em.persist(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    await em.flush();

    const other = await createDoc(em, ctx(OTHER_ORG_ID), { title: "Other doc" });
    await expect(getDoc(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });
});
