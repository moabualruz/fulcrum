import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { DEFAULT_ORG_ID } from "../db/seed.ts";
import { TaskWatcher } from "../db/entities/tasks/TaskWatcher.ts";
import { createTestOrm, type TestOrm } from "../test-utils/db.ts";
import { RelationshipService } from "./RelationshipService.ts";
import { TaskService } from "./TaskService.ts";

let db: TestOrm | null = null;

async function freshDb(): Promise<TestOrm> {
  if (db) await db.close();
  db = await createTestOrm();
  return db;
}

beforeEach(async () => {
  await freshDb();
});

afterEach(async () => {
  await db?.close();
  db = null;
});

describe("RelationshipService integration", () => {
  test("creates, lists, detects cycles, and deletes persisted task relationships", async () => {
    const testDb = db!;
    const em = testDb.em.fork();
    const tasks = new TaskService(em);
    const relationships = new RelationshipService(em);

    const source = await tasks.create(DEFAULT_ORG_ID, { title: "Source", status: "pending" });
    const target = await tasks.create(DEFAULT_ORG_ID, { title: "Target", status: "pending" });
    const downstream = await tasks.create(DEFAULT_ORG_ID, { title: "Downstream", status: "pending" });

    const sourceBlocksTarget = await relationships.create(
      DEFAULT_ORG_ID,
      source.id,
      target.id,
      "blocks",
      testDb.seed.userId,
    );
    const targetBlocksDownstream = await relationships.create(
      DEFAULT_ORG_ID,
      target.id,
      downstream.id,
      "blocks",
      testDb.seed.userId,
    );

    expect(await relationships.listForTask(DEFAULT_ORG_ID, target.id)).toMatchObject([
      { id: sourceBlocksTarget.id, sourceTaskId: source.id, targetTaskId: target.id, type: "blocks" },
      { id: targetBlocksDownstream.id, sourceTaskId: target.id, targetTaskId: downstream.id, type: "blocks" },
    ]);
    expect(await relationships.listBlockers(DEFAULT_ORG_ID, target.id)).toMatchObject([
      { sourceTaskId: source.id, targetTaskId: target.id },
    ]);
    expect(await relationships.listBlockedBy(DEFAULT_ORG_ID, target.id)).toMatchObject([
      { sourceTaskId: target.id, targetTaskId: downstream.id },
    ]);
    expect(await relationships.getBlockedItems(DEFAULT_ORG_ID, "ignored-project")).toHaveLength(2);

    await expect(
      relationships.create(DEFAULT_ORG_ID, downstream.id, source.id, "blocks", testDb.seed.userId),
    ).rejects.toBeInstanceOf(TRPCError);

    await relationships.delete(DEFAULT_ORG_ID, sourceBlocksTarget.id);
    expect(await relationships.listBlockers(DEFAULT_ORG_ID, target.id)).toEqual([]);
    await expect(relationships.delete(DEFAULT_ORG_ID, sourceBlocksTarget.id)).rejects.toBeInstanceOf(TRPCError);
  });

  test("marks duplicates, auto-closes source task, and transfers only missing watchers", async () => {
    const testDb = db!;
    const em = testDb.em.fork();
    const tasks = new TaskService(em);
    const relationships = new RelationshipService(em);

    const duplicate = await tasks.create(DEFAULT_ORG_ID, { title: "Duplicate task", status: "pending" });
    const canonical = await tasks.create(DEFAULT_ORG_ID, { title: "Canonical task", status: "pending" });
    const sourceOnlyUser = "00000000-0000-0000-0000-000000000099";

    em.persist(em.create(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: duplicate.id,
      userId: sourceOnlyUser,
      source: "manual",
    } as never));
    em.persist(em.create(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: duplicate.id,
      userId: testDb.seed.userId,
      source: "manual",
    } as never));
    em.persist(em.create(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: canonical.id,
      userId: testDb.seed.userId,
      source: "manual",
    } as never));
    await em.flush();

    const relation = await relationships.markAsDuplicate(DEFAULT_ORG_ID, duplicate.id, canonical.id, {
      autoClose: true,
      transferWatchers: true,
    });

    expect(relation).toMatchObject({
      sourceTaskId: duplicate.id,
      targetTaskId: canonical.id,
      type: "duplicate_of",
    });
    expect((await tasks.get(DEFAULT_ORG_ID, duplicate.id))?.status).toBe("Canceled");

    const canonicalWatchers = await em.find(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: canonical.id,
    } as never, {
      orderBy: { userId: "ASC" },
    });
    expect(canonicalWatchers.map((watcher) => ({
      userId: watcher.userId,
      source: watcher.source,
    })).sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: sourceOnlyUser, source: "manual" },
      { userId: testDb.seed.userId, source: "manual" },
    ]);
  });
});
