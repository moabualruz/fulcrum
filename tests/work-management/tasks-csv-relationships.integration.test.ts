import { afterEach, describe, expect, test } from "bun:test";
import { TextDecoder } from "node:util";

import {
  createRelationship,
  deleteRelationship,
  listBlockedItems,
  listRelationshipsForTask,
  listTaskBlockers,
  listTasksBlockedBy,
  markTaskAsDuplicate,
  summarizeEntityRelationships,
} from "@work-management/application/relationships/commands.ts";
import {
  createTaskCsvApplication,
  exportTasksCsvForContext,
  importTasksFromCsvUpload,
} from "@work-management/application/tasks/csv.ts";
import { createTask } from "@work-management/application/tasks/commands.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { TaskWatcher } from "@work-management/infrastructure/database/entities/tasks/TaskWatcher.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  await db.pglite.query(
    `insert into "projects" ("id", "org_id", "name") values ($1, $2, $3)`,
    [PROJECT_ID, DEFAULT_ORG_ID, "CSV and relationship coverage"],
  );
  return db;
}

function appCtx(): AppContext {
  return { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
}

describe("task CSV application", () => {
  test("in-memory CSV app imports, deduplicates external ids, and exports project-scoped rows", async () => {
    const app = createTaskCsvApplication();

    const first = await app.importTasks({
      projectId: "alpha",
      csv: "external_id,title,status\nEXT-1,First,todo\nEXT-2,Second,done\n",
    });
    const duplicate = await app.importTasks({
      projectId: "alpha",
      csv: "external_id,title,status\nEXT-1,Again,todo\n",
    });
    await app.importTasks({
      projectId: "beta",
      csv: "external_id,title,status\nEXT-1,Beta,todo\n",
    });

    expect(first).toMatchObject({ created: 2, skipped: 0, errors: [] });
    expect(duplicate.created).toBe(0);
    expect(duplicate.skipped).toBe(1);

    const exported = await app.exportTasks({ projectId: "alpha" });
    expect(exported).toContain("EXT-1");
    expect(exported).toContain("EXT-2");
    expect(exported).not.toContain("Beta");
  });

  test("web CSV upload creates real tasks and export returns persisted scoped rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    const imported = await importTasksFromCsvUpload(em, appCtx(), {
      bytes: new TextEncoder().encode("Title,Status,Priority,Description\nImported A,in_progress,3,Alpha\nImported B,done,1,Beta\n"),
      columnMap: {
        Title: "title",
        Status: "status",
        Priority: "priority",
        Description: "description",
      },
    });

    expect(imported).toMatchObject({ total: 2, written: 2, skipped: 0 });

    const exported = await exportTasksCsvForContext(em, appCtx());
    const csv = new TextDecoder().decode(exported.bytes);

    expect(exported.entityCount).toBe(2);
    expect(csv).toContain("Imported A");
    expect(csv).toContain("Imported B");
    expect(csv).toContain(DEFAULT_ORG_ID);
    expect(csv).toContain(PROJECT_ID);
  });
});

describe("relationship application commands", () => {
  test("wrap WorkItemRelationshipService CRUD, blocker views, duplicate watcher transfer, and trace summary", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID };

    const source = await createTask(em, appCtx(), { title: "Source blocker", status: "pending" });
    const target = await createTask(em, appCtx(), { title: "Blocked target", status: "pending" });
    const duplicate = await createTask(em, appCtx(), { title: "Duplicate task", status: "pending" });
    const canonical = await createTask(em, appCtx(), { title: "Canonical task", status: "pending" });

    const blocks = await createRelationship(em, ctx, {
      sourceTaskId: source.id,
      targetTaskId: target.id,
      type: "blocks",
    });

    expect(await listRelationshipsForTask(em, ctx, target.id)).toMatchObject([
      { id: blocks.id, sourceTaskId: source.id, targetTaskId: target.id, type: "blocks" },
    ]);
    expect(await listTaskBlockers(em, ctx, target.id)).toMatchObject([
      { sourceTaskId: source.id, targetTaskId: target.id },
    ]);
    expect(await listTasksBlockedBy(em, ctx, source.id)).toMatchObject([
      { sourceTaskId: source.id, targetTaskId: target.id },
    ]);
    expect(await listBlockedItems(em, ctx, PROJECT_ID)).toMatchObject([
      { sourceTaskId: source.id, targetTaskId: target.id },
    ]);

    em.persist(em.create(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: duplicate.id,
      userId: USER_ID,
      source: "manual",
    } as never));
    /* flushed */

    const duplicateRel = await markTaskAsDuplicate(em, ctx, {
      sourceTaskId: duplicate.id,
      targetTaskId: canonical.id,
      autoClose: true,
      transferWatchers: true,
    });
    expect(duplicateRel).toMatchObject({
      sourceTaskId: duplicate.id,
      targetTaskId: canonical.id,
      type: "duplicate_of",
    });

    const canonicalWatchers = await em.find(TaskWatcher, {
      org: { id: DEFAULT_ORG_ID },
      taskId: canonical.id,
    } as never);
    expect(canonicalWatchers.map((watcher) => watcher.userId)).toEqual([USER_ID]);

    const summary = summarizeEntityRelationships({
      entity: { kind: "work_item", id: target.id },
      trace: {
        project: { kind: "project", id: PROJECT_ID },
        workItem: { kind: "work_item", id: target.id },
      },
      refs: [{ kind: "work_item", id: source.id }],
      include: ["workItems"],
    });
    expect(summary.counts.workItems).toBe(1);
    expect(summary.ids.workItems).toEqual([source.id]);
    expect(summary.expanded?.workItems).toEqual([{ kind: "work_item", id: source.id }]);

    await deleteRelationship(em, ctx, blocks.id);
    expect(await listTaskBlockers(em, ctx, target.id)).toEqual([]);
  });
});
