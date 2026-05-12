import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import {
  addTaskToSprint,
  appendEvent,
  checkEventHandled,
  closeSprint,
  createCustomField,
  createLocalOrg,
  createProject,
  createSavedView,
  createSprint,
  createTask,
  findApiKeyByHash,
  listBacklogTasks,
  listCustomFields,
  listEventsFiltered,
  listEventsForProject,
  listReposForProject,
  listSavedViews,
  listSprints,
  listSprintTasks,
  listTasks,
  linkRepoToProject,
  markEventHandled,
  moveTaskToSprint,
  removeTaskFromSprint,
  setSprintRetroDocId,
  sprintCapacityUsed,
  updateSprint,
  updateTask,
} from "./repositories.ts";
import type { DbHandle } from "./repositories.ts";
import type { ProductDb, SqlValue } from "../db/types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function productDbFrom(testDb: TestOrm): ProductDb {
  return {
    engine: "pglite",
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      const result = await testDb.pglite.query<T>(sql, params as unknown[]);
      return result.rows;
    },
    async exec(sql: string) {
      await testDb.pglite.exec(sql);
    },
    async close() {
      await testDb.close();
    },
  };
}

describe("product-kernel repositories with MikroORM EntityManager", () => {
  test("creates org, project, tasks, sprint assignments, events, and sprint close through the real database", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    const org = await createLocalOrg(em, { slug: "repo-em-org", name: "Repository EM Org" });
    const project = await createProject(em, {
      orgId: org.id,
      slug: "repo-em-project",
      name: "Repository EM Project",
      description: "Real database project",
    });
    const parent = await createTask(em, { orgId: org.id, projectId: project.id, title: "Parent", priority: 1 });
    const child = await createTask(em, {
      orgId: org.id,
      projectId: project.id,
      parentId: parent.id,
      title: "Child",
      status: "in_progress",
      priority: 5,
    });
    const sprint = await createSprint(em, {
      orgId: org.id,
      projectId: project.id,
      name: "Sprint A",
      goal: "Exercise EM branch",
      status: "active",
      capacityPoints: 8,
    });

    await addTaskToSprint(em, { sprintId: sprint.id, taskId: child.id });
    await em.execute(`UPDATE tasks SET points = ? WHERE id = ?`, [3, child.id]);

    expect(await sprintCapacityUsed(em, sprint.id)).toBe(3);
    expect((await listSprintTasks(em, sprint.id)).map((task) => task.id)).toEqual([child.id]);
    expect((await listBacklogTasks(em, project.id)).map((task) => task.id)).toEqual([parent.id]);

    const moved = await moveTaskToSprint(em, parent.id, sprint.id);
    expect(moved.sprint_id).toBe(sprint.id);
    await removeTaskFromSprint(em, { sprintId: sprint.id, taskId: parent.id });
    expect((await listBacklogTasks(em, project.id)).map((task) => task.id)).toContain(parent.id);

    const updatedTask = await updateTask(em, {
      id: child.id,
      title: "Child updated",
      description: "Updated by real EM test",
      status: "completed",
      priority: 9,
    });
    expect(updatedTask).toMatchObject({ title: "Child updated", status: "completed", priority: 9 });

    const updatedSprint = await updateSprint(em, {
      id: sprint.id,
      name: "Sprint A updated",
      goal: "Close it",
      capacityPoints: 13,
    });
    expect(updatedSprint).toMatchObject({ name: "Sprint A updated", capacity_points: 13 });

    const retro = await setSprintRetroDocId(em, sprint.id, "11111111-1111-4111-8111-111111111111");
    expect(retro.retro_doc_id).toBe("11111111-1111-4111-8111-111111111111");

    const closed = await closeSprint(em, sprint.id);
    expect(closed.sprint.status).toBe("completed");
    expect(closed.metrics).toMatchObject({ capacity_points: 13, completed_points: 3, total_tasks: 1, completed_tasks: 1, velocity: 3 });
    expect(closed.event.verb).toBe("closed");

    const explicitEvent = await appendEvent(em, {
      orgId: org.id,
      projectId: project.id,
      actor: "test-user",
      subjectKind: "task",
      subjectId: child.id,
      verb: "verified",
      payload: { source: "integration-test" },
    });
    await markEventHandled(em, explicitEvent.id, "coverage-test-handler");
    await markEventHandled(em, explicitEvent.id, "coverage-test-handler");
    expect(await checkEventHandled(em, explicitEvent.id, "coverage-test-handler")).toBe(true);
    expect(await checkEventHandled(em, explicitEvent.id, "missing-handler")).toBe(false);

    const projectEvents = await listEventsForProject(em, project.id);
    expect(projectEvents.map((event) => event.verb)).toEqual(expect.arrayContaining(["created", "updated", "sprint.added", "closed", "verified"]));
    const filteredEvents = await listEventsFiltered(em, {
      orgId: org.id,
      projectId: project.id,
      subjectKind: "task",
      actorId: "test-user",
      limit: 5,
    });
    expect(filteredEvents).toHaveLength(1);
    expect(filteredEvents[0]!.payload).toEqual({ source: "integration-test" });

    const listedSprints = await listSprints(em, project.id);
    expect(listedSprints.map((item) => item.id)).toContain(sprint.id);
    const listedTasks = await listTasks(em, { projectId: project.id, status: "completed", limit: 1 });
    expect(listedTasks.data.map((task) => task.id)).toEqual([child.id]);
    expect(listedTasks.cursor).toBeNull();
  });

  test("links and lists repositories by project using real repos rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const project = await createProject(em, {
      orgId: DEFAULT_ORG_ID,
      slug: "repo-link-project",
      name: "Repo Link Project",
    });
    const repoId = "22222222-2222-4222-8222-222222222222";

    await em.execute(
      `INSERT INTO repos (id, org_id, slug, name, kind, local_path, current_branch, sync_status, last_touched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())`,
      [repoId, DEFAULT_ORG_ID, "fulcrum-test", "Fulcrum Test", "local", "/tmp/fulcrum-test", "main", "idle"],
    );

    expect(await listReposForProject(em, project.id, DEFAULT_ORG_ID)).toEqual([]);
    await linkRepoToProject(em, repoId, project.id);

    const repos = await listReposForProject(em, project.id, DEFAULT_ORG_ID);
    expect(repos).toHaveLength(1);
    expect(repos[0]).toMatchObject({
      id: repoId,
      org_id: DEFAULT_ORG_ID,
      project_id: project.id,
      slug: "fulcrum-test",
      name: "Fulcrum Test",
      kind: "local",
      local_path: "/tmp/fulcrum-test",
      current_branch: "main",
      sync_status: "idle",
    });
  });

  test("accepts wrapper handles and updates API key last-used timestamps through real SQL", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const wrapped = { em } as unknown as DbHandle;
    const org = await createLocalOrg(wrapped, { slug: "wrapped-org", name: "Wrapped Org" });
    const project = await createProject(wrapped, {
      orgId: org.id,
      slug: "wrapped-project",
      name: "Wrapped Project",
    });

    expect(project.org_id).toBe(org.id);

    await em.execute(
      `CREATE TABLE IF NOT EXISTS api_keys (
        id text PRIMARY KEY,
        org_id text NOT NULL,
        user_id text NOT NULL,
        key_hash text NOT NULL UNIQUE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz
      )`,
    );
    await em.execute(
      `INSERT INTO api_keys (id, org_id, user_id, key_hash, name, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [
        "99999999-9999-4999-8999-999999999999",
        org.id,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "hash-live",
        "Live API key",
        new Date("2026-05-01T00:00:00.000Z"),
      ],
    );

    expect(await findApiKeyByHash(em, "missing-hash")).toBeUndefined();
    const apiKey = await findApiKeyByHash(em, "hash-live");

    expect(apiKey).toMatchObject({
      id: "99999999-9999-4999-8999-999999999999",
      org_id: org.id,
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      key_hash: "hash-live",
      name: "Live API key",
      created_at: "2026-05-01T00:00:00.000Z",
    });
    expect(apiKey?.last_used_at).toEqual(expect.any(String));
  });

  test("covers repository error paths, task filters, pagination, and sprint scope checks with real rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const org = await createLocalOrg(em, { slug: "repo-branch-org", name: "Repository Branch Org" });
    const projectA = await createProject(em, {
      orgId: org.id,
      slug: "repo-branch-project-a",
      name: "Repository Branch Project A",
    });
    const projectB = await createProject(em, {
      orgId: org.id,
      slug: "repo-branch-project-b",
      name: "Repository Branch Project B",
    });
    const assigneeId = "33333333-3333-4333-8333-333333333333";
    const first = await createTask(em, { orgId: org.id, projectId: projectA.id, title: "A first", status: "pending" });
    const second = await createTask(em, { orgId: org.id, projectId: projectA.id, title: "A second", status: "pending" });
    const assigned = await createTask(em, { orgId: org.id, projectId: projectA.id, title: "Assigned", status: "in_progress" });
    const outside = await createTask(em, { orgId: org.id, projectId: projectB.id, title: "Outside", status: "pending" });
    await updateTask(em, { id: assigned.id, assigneeId, priority: 3 });

    const page = await listTasks(em, { projectId: projectA.id, status: "pending", limit: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.cursor).toBe(page.data[0]!.id);
    const nextPage = await listTasks(em, { projectId: projectA.id, status: "pending", cursor: page.cursor!, limit: 5 });
    expect([...page.data, ...nextPage.data].map((task) => task.id).sort()).toEqual([first.id, second.id].sort());
    expect((await listTasks(em, { projectId: projectA.id, assigneeId })).data.map((task) => task.id)).toEqual([assigned.id]);

    await expect(updateTask(em, { id: first.id })).rejects.toThrow("updateTask: no fields to update");
    await expect(updateTask(em, { id: "44444444-4444-4444-8444-444444444444", title: "Missing" })).rejects.toThrow("task not found");

    const sprintA = await createSprint(em, {
      orgId: org.id,
      projectId: projectA.id,
      name: "Scoped Sprint A",
      status: "active",
    });
    await expect(addTaskToSprint(em, { sprintId: sprintA.id, taskId: outside.id })).rejects.toThrow("outside sprint scope");
    await expect(addTaskToSprint(em, { sprintId: sprintA.id, taskId: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow("task not found");
    await expect(addTaskToSprint(em, { sprintId: "66666666-6666-4666-8666-666666666666", taskId: first.id })).rejects.toThrow("sprint not found");
    await expect(removeTaskFromSprint(em, { sprintId: sprintA.id, taskId: outside.id })).rejects.toThrow("task not found in sprint");
    await expect(setSprintRetroDocId(em, "77777777-7777-4777-8777-777777777777", "88888888-8888-4888-8888-888888888888")).rejects.toThrow("sprint not found");
  });

  test("manages custom fields, saved views, nullable sprint dates, and closed sprint guards through EntityManager", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const org = await createLocalOrg(em, { slug: "repo-config-org", name: "Repository Config Org" });
    const project = await createProject(em, {
      orgId: org.id,
      slug: "repo-config-project",
      name: "Repository Config Project",
    });

    const riskField = await createCustomField(em, {
      orgId: org.id,
      projectId: project.id,
      name: "Risk Level",
      fieldType: "select",
      options: ["low", "medium", "high"],
      position: 2,
    });
    const ownerField = await createCustomField(em, {
      orgId: org.id,
      projectId: project.id,
      name: "Owner",
      fieldType: "text",
      position: 1,
    });

    expect((await listCustomFields(em, project.id)).map((field) => field.id)).toEqual([ownerField.id, riskField.id]);
    expect(riskField).toMatchObject({
      org_id: org.id,
      project_id: project.id,
      name: "Risk Level",
      field_type: "select",
      position: 2,
    });
    expect(riskField.options).toEqual({ options: ["low", "medium", "high"] });

    const triageView = await createSavedView(em, {
      orgId: org.id,
      projectId: project.id,
      name: "Triage",
      filters: { status: ["pending", "in_progress"] },
      sortBy: "priority",
      columns: ["title", "status", "priority"],
      isDefault: true,
    });
    const blankView = await createSavedView(em, {
      orgId: org.id,
      projectId: project.id,
      name: "All work",
    });

    expect((await listSavedViews(em, project.id)).map((view) => view.name)).toEqual(["All work", "Triage"]);
    expect(triageView).toMatchObject({
      filters: { status: ["pending", "in_progress"] },
      sort_by: "priority",
      is_default: true,
    });
    expect(blankView).toMatchObject({ filters: {}, sort_by: null, is_default: false });

    const sprint = await createSprint(em, {
      orgId: org.id,
      projectId: project.id,
      name: "Config Sprint",
      goal: "Check date and guard branches",
      status: "active",
      capacityPoints: null,
      startDate: "2026-05-10",
      endDate: "2026-05-17",
    });
    expect(sprint).toMatchObject({
      capacity_points: 0,
      start_date: "2026-05-10T00:00:00.000Z",
      end_date: "2026-05-17T00:00:00.000Z",
    });

    const updatedSprint = await updateSprint(em, {
      id: sprint.id,
      goal: null,
      status: "completed",
      capacityPoints: null,
      startDate: null,
      endDate: null,
    });
    expect(updatedSprint).toMatchObject({
      goal: null,
      status: "completed",
      capacity_points: null,
      start_date: "2026-05-10T00:00:00.000Z",
      end_date: "2026-05-17T00:00:00.000Z",
    });
    await expect(closeSprint(em, sprint.id)).rejects.toThrow("sprint already closed");
    await expect(closeSprint(em, "12121212-1212-4212-8212-121212121212")).rejects.toThrow("sprint not found");
  });

  test("legacy ProductDb branch runs against the same migrated PGlite schema", async () => {
    const testDb = await freshDb();
    const legacyDb = productDbFrom(testDb);
    const org = await createLocalOrg(legacyDb, { slug: "legacy-product-db", name: "Legacy ProductDb" });
    const project = await createProject(legacyDb, {
      orgId: org.id,
      slug: "legacy-product-project",
      name: "Legacy Product Project",
      description: null,
    });
    const sprint = await createSprint(legacyDb, {
      orgId: org.id,
      projectId: project.id,
      name: "Legacy Sprint",
      status: "active",
      capacityPoints: 5,
    });
    const task = await createTask(legacyDb, {
      orgId: org.id,
      projectId: project.id,
      title: "Legacy task",
      description: "ProductDb path",
      priority: 4,
    });

    await addTaskToSprint(legacyDb, { sprintId: sprint.id, taskId: task.id });
    await legacyDb.query(`UPDATE tasks SET points = $1 WHERE id = $2`, [2, task.id]);
    expect(await sprintCapacityUsed(legacyDb, sprint.id)).toBe(2);
    expect((await listSprintTasks(legacyDb, sprint.id)).map((row) => row.id)).toEqual([task.id]);

    await removeTaskFromSprint(legacyDb, { sprintId: sprint.id, taskId: task.id });
    expect((await listBacklogTasks(legacyDb, project.id)).map((row) => row.id)).toEqual([task.id]);
    await moveTaskToSprint(legacyDb, task.id, sprint.id);
    const updated = await updateTask(legacyDb, {
      id: task.id,
      status: "completed",
      priority: 7,
      assigneeId: null,
    });
    expect(updated).toMatchObject({ status: "completed", priority: 7, sprint_id: sprint.id });

    const field = await createCustomField(legacyDb, {
      orgId: org.id,
      projectId: project.id,
      name: "Risk",
      fieldType: "select",
      options: ["low", "high"],
      position: 2,
    });
    expect(field).toMatchObject({ name: "Risk", field_type: "select", position: 2 });
    expect((await listCustomFields(legacyDb, project.id)).map((row) => row.id)).toEqual([field.id]);

    const view = await createSavedView(legacyDb, {
      orgId: org.id,
      projectId: project.id,
      name: "Done work",
      filters: { status: "completed" },
      sortBy: "priority",
      columns: ["title", "status"],
      isDefault: true,
    });
    expect(view).toMatchObject({ name: "Done work", sort_by: "priority", is_default: true });
    expect((await listSavedViews(legacyDb, project.id)).map((row) => row.id)).toEqual([view.id]);

    const closed = await closeSprint(legacyDb, sprint.id);
    expect(closed.metrics).toMatchObject({ capacity_points: 5, completed_points: 2, total_tasks: 1, completed_tasks: 1 });
    await expect(closeSprint(legacyDb, sprint.id)).rejects.toThrow("sprint already closed");

    const event = await appendEvent(legacyDb, {
      orgId: org.id,
      projectId: project.id,
      actor: "legacy-user",
      subjectKind: "task",
      subjectId: task.id,
      verb: "legacy.checked",
      payload: { branch: "ProductDb" },
    });
    await markEventHandled(legacyDb, event.id, "legacy-handler");
    expect(await checkEventHandled(legacyDb, event.id, "legacy-handler")).toBe(true);
    expect((await listEventsForProject(legacyDb, project.id)).map((row) => row.verb)).toContain("legacy.checked");
    expect(await listEventsFiltered(legacyDb, { orgId: org.id, verb: "legacy.checked", limit: 2 })).toHaveLength(1);

    const page = await listTasks(legacyDb, { projectId: project.id, cursor: "", limit: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.cursor).toBeNull();

  });

  test("legacy ProductDb capacity calculation falls back to estimate_points when points is absent", async () => {
    const queries: string[] = [];
    const legacyDb: ProductDb = {
      engine: "pglite",
      async query<T>(sql: string, _params: readonly SqlValue[] = []) {
        queries.push(sql);
        if (sql.includes("information_schema.columns")) {
          return [{ column_name: "estimate_points" }] as T[];
        }
        if (sql.includes("COALESCE(SUM(estimate_points), 0)")) {
          return [{ used: "8" }] as T[];
        }
        return [] as T[];
      },
      async exec() {},
      async close() {},
    };

    expect(await sprintCapacityUsed(legacyDb, "sprint-1")).toBe(8);
    expect(queries.some((sql) => sql.includes("COALESCE(SUM(estimate_points), 0)"))).toBe(true);
  });

  test("legacy ProductDb closeSprint uses estimate_points fallback for metrics and closed event", async () => {
    const queries: string[] = [];
    const sprintRow = {
      id: "sprint-1",
      org_id: "org-1",
      project_id: "project-1",
      name: "Sprint 1",
      goal: "Goal",
      status: "active",
      capacity_points: 13,
      start_date: "2026-05-01",
      end_date: "2026-05-02",
      closed_at: null,
      metrics_snapshot: null,
      retro_doc_id: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    };
    const legacyDb: ProductDb = {
      engine: "pglite",
      async query<T>(sql: string, params: readonly SqlValue[] = []) {
        queries.push(sql);
        if (sql.includes("information_schema.columns")) {
          return [{ column_name: "estimate_points" }] as T[];
        }
        if (sql.startsWith("SELECT * FROM sprints")) {
          return [sprintRow] as T[];
        }
        if (sql.includes("COUNT(*) AS total_tasks")) {
          return [{ completed_points: "8", total_tasks: "3", completed_tasks: "2" }] as T[];
        }
        if (sql.startsWith("UPDATE sprints")) {
          return [
            {
              ...sprintRow,
              status: "completed",
              closed_at: "2026-05-03T00:00:00.000Z",
              metrics_snapshot: JSON.parse(String(params[0])),
              updated_at: "2026-05-03T00:00:00.000Z",
            },
          ] as T[];
        }
        if (sql.includes("INSERT INTO events")) {
          return [
            {
              id: "event-1",
              org_id: params[1],
              project_id: params[2],
              actor: params[3],
              subject_kind: params[4],
              subject_id: params[5],
              verb: params[6],
              payload: JSON.parse(String(params[7])),
              created_at: "2026-05-03T00:00:01.000Z",
            },
          ] as T[];
        }
        return [] as T[];
      },
      async exec() {},
      async close() {},
    };

    const result = await closeSprint(legacyDb, "sprint-1");

    expect(result.sprint.status).toBe("completed");
    expect(result.metrics).toEqual({
      capacity_points: 13,
      completed_points: 8,
      total_tasks: 3,
      completed_tasks: 2,
      velocity: 8,
    });
    expect(result.event).toMatchObject({ verb: "closed", subject_id: "sprint-1" });
    expect(result.event.payload).toMatchObject({ metrics_snapshot: result.metrics });
    expect(queries.some((sql) => sql.includes("THEN estimate_points ELSE 0 END"))).toBe(true);
  });

  test("legacy ProductDb API key lookup returns undefined on miss and maps touched key rows", async () => {
    const queries: Array<{ sql: string; params: readonly SqlValue[] }> = [];
    const legacyDb: ProductDb = {
      engine: "pglite",
      async query<T>(sql: string, params: readonly SqlValue[] = []) {
        queries.push({ sql, params });
        if (params[0] === "known-hash") {
          return [
            {
              id: "key-1",
              org_id: "org-1",
              user_id: "user-1",
              key_hash: "known-hash",
              name: "Known key",
              created_at: "2026-05-01T00:00:00.000Z",
              last_used_at: "2026-05-02T00:00:00.000Z",
            },
          ] as T[];
        }
        return [] as T[];
      },
      async exec() {},
      async close() {},
    };

    expect(await findApiKeyByHash(legacyDb, "missing-hash")).toBeUndefined();
    expect(await findApiKeyByHash(legacyDb, "known-hash")).toEqual({
      id: "key-1",
      org_id: "org-1",
      user_id: "user-1",
      key_hash: "known-hash",
      name: "Known key",
      created_at: "2026-05-01T00:00:00.000Z",
      last_used_at: "2026-05-02T00:00:00.000Z",
    });
    expect(queries.map(({ sql }) => sql)).toEqual([
      expect.stringContaining("UPDATE api_keys SET last_used_at = now()"),
      expect.stringContaining("UPDATE api_keys SET last_used_at = now()"),
    ]);
    expect(queries.map(({ params }) => params[0])).toEqual(["missing-hash", "known-hash"]);
  });

  test("repository functions reject handles that are neither ProductDb nor EntityManager", async () => {
    await expect(createLocalOrg({} as DbHandle, { slug: "bad", name: "Bad" })).rejects.toThrow(
      "MikroORM EntityManager required",
    );
  });
});
