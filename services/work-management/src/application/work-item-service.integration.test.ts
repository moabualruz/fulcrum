import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { AppConflictError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { FieldDependencyRule } from "@work-management/infrastructure/database/entities/tasks/FieldDependencyRule.ts";
import { WorkItemService, normalizedUnique } from "@work-management/application/work-item-service.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

async function createProject(em: TestOrm["em"], name = "WorkItemService class project"): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, `task-service-class-${id.slice(0, 8)}`, name, "WorkItemService class integration"],
  );
  return id;
}

describe("WorkItemService class with real persistence", () => {
  test("creates, lists, gets, updates, soft-deletes, and includes deleted tasks only when requested", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const service = new WorkItemService(em);

    const created = await service.create(DEFAULT_ORG_ID, {
      title: "Class task",
      descriptionText: "Body text",
      status: "todo",
      priority: 3,
      points: 5,
    });

    expect(created).toMatchObject({
      orgId: DEFAULT_ORG_ID,
      title: "Class task",
      descriptionText: "Body text",
      status: "todo",
      priority: 3,
      points: 5,
      parentId: null,
      deletedAt: null,
    });
    expect(await service.get(DEFAULT_ORG_ID, created.id)).toMatchObject({ id: created.id });
    expect((await service.list(DEFAULT_ORG_ID)).map((task) => task.id)).toEqual([created.id]);

    const updated = await service.update(DEFAULT_ORG_ID, {
      id: created.id,
      title: "Class task updated",
      descriptionText: "Updated body",
      status: "in_progress",
      priority: 1,
      points: 8,
    });
    expect(updated).toMatchObject({
      id: created.id,
      title: "Class task updated",
      descriptionText: "Updated body",
      status: "in_progress",
      priority: 1,
      points: 8,
    });

    const deleted = await service.delete(DEFAULT_ORG_ID, created.id);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(await service.list(DEFAULT_ORG_ID)).toEqual([]);
    expect((await service.list(DEFAULT_ORG_ID, true)).map((task) => task.id)).toEqual([created.id]);
  });

  test("sets parents, rejects cycles, and returns children in creation order", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const service = new WorkItemService(em);

    const parent = await service.create(DEFAULT_ORG_ID, { title: "Parent" });
    const child = await service.create(DEFAULT_ORG_ID, { title: "Child" });
    const grandchild = await service.create(DEFAULT_ORG_ID, { title: "Grandchild" });

    expect(await service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, child.id, parent.id))
      .toMatchObject({ id: child.id, parentId: parent.id });
    expect(await service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, grandchild.id, child.id))
      .toMatchObject({ id: grandchild.id, parentId: child.id });
    expect((await service.listChildren(DEFAULT_ORG_ID, parent.id)).map((task) => task.id)).toEqual([child.id]);

    await expect(service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, parent.id, grandchild.id))
      .rejects.toBeInstanceOf(AppConflictError);
    expect(await service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, child.id, null))
      .toMatchObject({ id: child.id, parentId: null });
    expect(await service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, randomUUID(), null)).toBeNull();
    expect(await service.setParent({ orgId: DEFAULT_ORG_ID, userId: null, em }, child.id, randomUUID())).toBeNull();
  });

  test("sets dependency edges bidirectionally, normalizes ids, rejects self/cyclic/missing dependencies", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const service = new WorkItemService(em);

    const a = await service.create(DEFAULT_ORG_ID, { title: "A" });
    const b = await service.create(DEFAULT_ORG_ID, { title: "B" });
    const c = await service.create(DEFAULT_ORG_ID, { title: "C" });

    expect(normalizedUnique([b.id, a.id, b.id])).toEqual([a.id, b.id].sort());

    const withDeps = await service.setDependencies(
      { orgId: DEFAULT_ORG_ID, userId: null, em },
      a.id,
      { blocks: [b.id], blocked_by: [c.id] },
    );
    expect(withDeps).toMatchObject({
      id: a.id,
      dependencies: { blocks: [b.id], blocked_by: [c.id] },
    });

    expect((await service.get(DEFAULT_ORG_ID, b.id))?.dependencies.blocked_by).toEqual([a.id]);
    expect((await service.get(DEFAULT_ORG_ID, c.id))?.dependencies.blocks).toEqual([a.id]);
    await expect(service.setDependencies(
      { orgId: DEFAULT_ORG_ID, userId: null, em },
      a.id,
      { blocks: [b.id, b.id], blocked_by: [] },
    )).rejects.toBeInstanceOf(AppConflictError);
    await expect(service.setDependencies(
      { orgId: DEFAULT_ORG_ID, userId: null, em },
      a.id,
      { blocks: [a.id], blocked_by: [] },
    )).rejects.toBeInstanceOf(AppConflictError);
    expect(await service.setDependencies(
      { orgId: DEFAULT_ORG_ID, userId: null, em },
      a.id,
      { blocks: [randomUUID()], blocked_by: [] },
    )).toBeNull();
    expect(await service.setDependencies(
      { orgId: DEFAULT_ORG_ID, userId: null, em },
      randomUUID(),
      { blocks: [], blocked_by: [] },
    )).toBeNull();
  });

  test("bulk updates and deletes real rows, writes events, and enforces the 200 item cap", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const service = new WorkItemService(em);
    const projectId = await createProject(em);

    const one = await service.create(DEFAULT_ORG_ID, { title: "Bulk one" });
    const two = await service.create(DEFAULT_ORG_ID, { title: "Bulk two" });

    expect(await service.bulkUpdate(
      { orgId: DEFAULT_ORG_ID, userId: "bulk-user", em },
      [one.id, two.id],
      {
        title: "Bulk renamed",
        descriptionText: "Bulk body",
        status: "active",
        priority: 7,
        points: 13,
        assignee: "mkh",
        label: "coverage",
        projectId,
      },
    )).toEqual({ updated: 2 });

    const rows = await em.getConnection().execute(
      `SELECT title, status, priority, points, project_id, custom_fields
         FROM tasks
        WHERE id IN (?, ?)
        ORDER BY id ASC`,
      [one.id, two.id],
    ) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.title === "Bulk renamed")).toBe(true);
    expect(rows.every((row) => row.project_id === projectId)).toBe(true);
    expect(rows.every((row) => (row.custom_fields as Record<string, unknown>).assignee === "mkh")).toBe(true);

    expect(await service.bulkDelete({ orgId: DEFAULT_ORG_ID, userId: "bulk-user", em }, [one.id, two.id]))
      .toEqual({ deleted: 2 });
    expect(await service.list(DEFAULT_ORG_ID)).toEqual([]);

    const eventRows = await em.getConnection().execute(
      `SELECT verb FROM events WHERE subject_kind = 'task' AND subject_id IN (?, ?) ORDER BY verb`,
      [one.id, two.id],
    ) as Array<{ verb: string }>;
    expect(eventRows.map((row) => row.verb)).toContain("bulk_deleted");
    expect(eventRows.map((row) => row.verb)).toContain("bulk_updated");

    const tooMany = Array.from({ length: 201 }, (_, index) => `task-${index}`);
    await expect(service.bulkUpdate({ orgId: DEFAULT_ORG_ID, userId: null, em }, tooMany, { status: "done" }))
      .rejects.toBeInstanceOf(AppValidationError);
    await expect(service.bulkDelete({ orgId: DEFAULT_ORG_ID, userId: null, em }, tooMany))
      .rejects.toBeInstanceOf(AppValidationError);
    await expect(service.bulkDelete({ orgId: DEFAULT_ORG_ID, userId: null, em }, [randomUUID()]))
      .rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("validates field dependency rules during project-scoped updates", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const service = new WorkItemService(em);
    const projectId = await createProject(em, "Dependency rule project");
    const task = await service.create(DEFAULT_ORG_ID, { title: "Dependency rule task" });
    const sourceFieldId = randomUUID();
    const targetFieldId = randomUUID();

    await em.save(em.create(FieldDependencyRule, {
      id: randomUUID(),
      org: em.getReference(Org, DEFAULT_ORG_ID),
      projectId,
      sourceFieldId,
      sourceValue: "high",
      targetFieldId,
      action: "require",
      createdAt: new Date(),
    } as never));

    await em.getConnection().execute(
      `UPDATE tasks SET custom_fields = ?::jsonb WHERE id = ?`,
      [JSON.stringify({ [sourceFieldId]: "high" }), task.id],
    );
    em.clear();

    await expect(service.update(DEFAULT_ORG_ID, { id: task.id, projectId, title: "Should fail" }))
      .rejects.toBeInstanceOf(AppValidationError);

    await em.getConnection().execute(
      `UPDATE tasks SET custom_fields = ?::jsonb WHERE id = ?`,
      [JSON.stringify({ [sourceFieldId]: "high", [targetFieldId]: "mkh" }), task.id],
    );
    em.clear();
    expect(await service.update(DEFAULT_ORG_ID, { id: task.id, projectId, title: "Allowed" }))
      .toMatchObject({ title: "Allowed" });
  });
});
