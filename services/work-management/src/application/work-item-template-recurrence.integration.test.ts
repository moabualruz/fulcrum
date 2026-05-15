import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  AppConflictError,
  AppInvariantError,
  AppNotFoundError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { WorkItemService } from "@work-management/application/work-item-service.ts";
import { WorkItemTemplateService } from "@work-management/application/work-item-templates.ts";
import { WorkItemRecurrenceService } from "@work-management/application/work-item-recurrence.ts";
import { resolveDocTemplate } from "@work-management/application/templates/queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("template, recurrence, and task services with migrated PGlite data", () => {
  test("doc template resolution reports missing application service as AppInvariantError", async () => {
    await expect(resolveDocTemplate(null, null, { orgId: DEFAULT_ORG_ID }, null, "adr"))
      .rejects.toBeInstanceOf(AppInvariantError);
  });

  test("WorkItemTemplateService creates workspace/project templates, applies overrides, sets defaults, and deletes", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const service = new WorkItemTemplateService(em);
    const projectId = randomUUID();
    const userId = testDb.seed.userId;
    await em.getConnection().execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "template-project", "Template Project"],
    );

    const workspaceTemplate = await service.create(
      DEFAULT_ORG_ID,
      null,
      "Workspace bug",
      { title: "Bug", status: "pending", points: 2 },
      userId,
      "Shared bug template",
    );
    const projectTemplate = await service.create(
      DEFAULT_ORG_ID,
      projectId,
      "Project story",
      { title: "Story", status: "in_progress", points: 5 },
      userId,
    );

    expect(await service.list(DEFAULT_ORG_ID, projectId)).toMatchObject([
      { id: workspaceTemplate.id, projectId: null, name: "Workspace bug" },
      { id: projectTemplate.id, projectId, name: "Project story" },
    ]);
    expect(await service.apply(DEFAULT_ORG_ID, workspaceTemplate.id, { points: 8, label: "urgent" })).toEqual({
      title: "Bug",
      status: "pending",
      points: 8,
      label: "urgent",
    });

    await service.setDefault(DEFAULT_ORG_ID, projectId, projectTemplate.id);
    expect((await service.list(DEFAULT_ORG_ID, projectId)).find((row) => row.id === projectTemplate.id)?.isDefault).toBe(true);
    await service.delete(DEFAULT_ORG_ID, workspaceTemplate.id);
    expect((await service.list(DEFAULT_ORG_ID, projectId)).map((row) => row.id)).toEqual([projectTemplate.id]);
    await expect(service.apply(DEFAULT_ORG_ID, workspaceTemplate.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("WorkItemRecurrenceService creates scheduled/on-complete rules, clones due tasks, disables maxed rules, and deletes", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const taskService = new WorkItemService(em);
    const recurrence = new WorkItemRecurrenceService(em, taskService);

    const source = await taskService.create(DEFAULT_ORG_ID, {
      title: "Weekly review",
      description: "Inspect real service behavior",
      status: "pending",
      priority: 2,
      points: 3,
    });

    const scheduled = await recurrence.create(DEFAULT_ORG_ID, source.id, {
      triggerType: "schedule",
      intervalDays: 7,
      maxOccurrences: 1,
    });
    await em.getConnection().execute(
      `UPDATE task_recurrence_rules SET next_run_at = ? WHERE id = ?`,
      ["2026-05-01T00:00:00Z", scheduled.id],
    );
    await recurrence.processDue();

    const tasksAfterProcess = await taskService.list(DEFAULT_ORG_ID);
    expect(tasksAfterProcess.map((task) => task.title).sort()).toEqual(["Weekly review", "Weekly review"]);
    expect((await recurrence.list(DEFAULT_ORG_ID, source.id))[0]).toMatchObject({
      id: scheduled.id,
      enabled: false,
      occurrencesCreated: 1,
      nextRunAt: null,
    });

    const onComplete = await recurrence.create(DEFAULT_ORG_ID, source.id, {
      triggerType: "on_complete",
      intervalDays: 2,
    });
    await recurrence.onTaskComplete(DEFAULT_ORG_ID, source.id);
    expect((await recurrence.list(DEFAULT_ORG_ID, source.id)).find((rule) => rule.id === onComplete.id)?.nextRunAt).toBeInstanceOf(Date);

    await recurrence.delete(DEFAULT_ORG_ID, onComplete.id);
    expect((await recurrence.list(DEFAULT_ORG_ID, source.id)).map((rule) => rule.id)).toEqual([scheduled.id]);
    await expect(recurrence.create(DEFAULT_ORG_ID, source.id, { triggerType: "schedule" }))
      .rejects.toBeInstanceOf(AppValidationError);
    await expect(recurrence.delete(DEFAULT_ORG_ID, onComplete.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("WorkItemService bulk operations, parent hierarchy, dependency graph, and delete persist events", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const service = new WorkItemService(em);
    const ctx = { orgId: DEFAULT_ORG_ID, userId: testDb.seed.userId, em };

    const parent = await service.create(DEFAULT_ORG_ID, { title: "Parent", status: "pending" });
    const child = await service.create(DEFAULT_ORG_ID, { title: "Child", status: "pending" });
    const blocker = await service.create(DEFAULT_ORG_ID, { title: "Blocker", status: "pending" });

    expect(await service.setParent(ctx, child.id, parent.id)).toMatchObject({ id: child.id, parentId: parent.id });
    await expect(service.setParent(ctx, parent.id, child.id)).rejects.toBeInstanceOf(AppConflictError);
    expect(await service.listChildren(DEFAULT_ORG_ID, parent.id)).toMatchObject([{ id: child.id, title: "Child" }]);

    expect(await service.setDependencies(ctx, child.id, { blocks: [], blocked_by: [blocker.id] })).toMatchObject({
      id: child.id,
      dependencies: { blocks: [], blocked_by: [blocker.id] },
    });
    await expect(service.setDependencies(ctx, child.id, { blocks: [blocker.id], blocked_by: [] }))
      .rejects.toBeInstanceOf(AppConflictError);

    expect(await service.bulkUpdate(ctx, [child.id, blocker.id], { status: "blocked", points: 8, label: "needs-review" })).toEqual({ updated: 2 });
    expect((await service.get(DEFAULT_ORG_ID, child.id))?.status).toBe("blocked");
    expect(await service.bulkDelete(ctx, [blocker.id])).toEqual({ deleted: 1 });
    expect(await service.get(DEFAULT_ORG_ID, blocker.id)).toBeNull();
    expect((await service.list(DEFAULT_ORG_ID, true)).find((task) => task.id === blocker.id)?.deletedAt).toBeInstanceOf(Date);

    const eventRows = await em.getConnection().execute<Array<{ verb: string }>>(
      `SELECT verb FROM events WHERE org_id = ? AND subject_kind = 'task' ORDER BY created_at ASC`,
      [DEFAULT_ORG_ID],
    );
    expect(eventRows.map((row) => row.verb)).toEqual([
      "parent_changed",
      "dependency_updated",
      "bulk_updated",
      "bulk_updated",
      "bulk_deleted",
    ]);
  });
});
