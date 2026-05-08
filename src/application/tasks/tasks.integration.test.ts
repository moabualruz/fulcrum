import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";
import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppConflictError, AppForbiddenError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { createTask, deleteTask, setDependencies, setParent, updateTask } from "./commands.ts";
import { getTask, listChildren, listTasks } from "./queries.ts";
import type { AppContext } from "./types.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_A_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_B_ID = "33333333-3333-4333-8333-333333333333";

let db: TestOrm | null = null;

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

afterEach(async () => {
  await db?.close();
  db = null;
});

function ctx(orgId = DEFAULT_ORG_ID): AppContext {
  return { orgId, userId: USER_ID, projectId: null };
}

function projectCtx(projectId: string): AppContext {
  return { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId };
}

async function seedProjects(testDb: TestOrm): Promise<void> {
  await testDb.pglite.query(
    `insert into "projects" ("id", "org_id", "name") values ($1, $2, $3), ($4, $2, $5)`,
    [PROJECT_A_ID, DEFAULT_ORG_ID, "Project A", PROJECT_B_ID, "Project B"],
  );
}

describe("application tasks commands and queries", () => {
  test("createTask, listTasks, getTask, updateTask, and deleteTask round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();

    const created = await createTask(em, ctx(), {
      title: "Application boundary task",
      description: "Created through command",
      status: "todo",
      priority: 2,
      points: 3,
    });

    expect(created).toMatchObject({
      orgId: DEFAULT_ORG_ID,
      projectId: null,
      title: "Application boundary task",
      status: "todo",
      priority: 2,
      points: 3,
    });

    const listed = await listTasks(em, ctx());
    expect(listed.map((task) => task.id)).toEqual([created.id]);

    const fetched = await getTask(em, ctx(), created.id);
    expect(fetched.id).toBe(created.id);

    const updated = await updateTask(em, ctx(), created.id, {
      title: "Updated through command",
      status: "in_progress",
      points: null,
    });
    expect(updated).toMatchObject({
      id: created.id,
      title: "Updated through command",
      status: "in_progress",
      points: null,
    });

    const deleted = await deleteTask(em, ctx(), created.id);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    await expect(getTask(em, ctx(), created.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("createTask validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(
      createTask(testDb.em.fork(), ctx(), { title: "" }),
    ).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getTask not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(
      getTask(testDb.em.fork(), ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    em.persist(em.create(Org, {
      id: OTHER_ORG_ID,
      name: "Other",
      slug: "other",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await em.flush();

    const otherRepo = em.getRepository(Task) as TaskRepository;
    const otherTask = otherRepo.create({
      orgId: OTHER_ORG_ID,
      title: "Other org task",
      status: "todo",
    });
    await em.flush();

    await expect(getTask(em, ctx(), otherTask.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });

  test("CR-02 removes stale reverse blocked_by dependency edges", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const blocked = await createTask(em, ctx(), { title: "Blocked task" });
    const blocker = await createTask(em, ctx(), { title: "Blocker task" });

    await setDependencies(em, ctx(), blocked.id, {
      blocks: [],
      blocked_by: [blocker.id],
    });
    await setDependencies(em, ctx(), blocked.id, {
      blocks: [],
      blocked_by: [],
    });

    expect((await getTask(em, ctx(), blocked.id)).dependencies.blocked_by).toEqual([]);
    expect((await getTask(em, ctx(), blocker.id)).dependencies.blocks).toEqual([]);
  });

  test("CR-03 project-scoped context cannot read or mutate another project task", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    await seedProjects(testDb);
    const visible = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Visible project task" });
    const hidden = await createTask(em, projectCtx(PROJECT_B_ID), { title: "Hidden project task" });
    const hiddenForDelete = await createTask(em, projectCtx(PROJECT_B_ID), { title: "Hidden delete task" });

    await expect(getTask(em, projectCtx(PROJECT_A_ID), hidden.id)).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(
      updateTask(em, projectCtx(PROJECT_A_ID), hidden.id, { title: "Cross-project update" }),
    ).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(
      deleteTask(em, projectCtx(PROJECT_A_ID), hiddenForDelete.id),
    ).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(
      setParent(em, projectCtx(PROJECT_A_ID), hidden.id, visible.id),
    ).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(
      setDependencies(em, projectCtx(PROJECT_A_ID), hidden.id, { blocks: [visible.id], blocked_by: [] }),
    ).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("WR-02 listTasks applies project scope before serialization", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    await seedProjects(testDb);
    const projectA = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Project A task" });
    await createTask(em, projectCtx(PROJECT_B_ID), { title: "Project B task" });

    const listed = await listTasks(em, projectCtx(PROJECT_A_ID));

    expect(listed.map((task) => task.id)).toEqual([projectA.id]);
  });

  test("project-scoped listChildren hides cross-project children and rejects implicit cross-project parenting", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    await seedProjects(testDb);
    const parent = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Project A parent" });
    const visibleChild = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Project A child" });
    const hiddenChild = await createTask(em, projectCtx(PROJECT_B_ID), { title: "Project B child" });

    await setParent(em, ctx(), visibleChild.id, parent.id);
    await expect(setParent(em, ctx(), hiddenChild.id, parent.id)).rejects.toBeInstanceOf(AppConflictError);

    const children = await listChildren(em, projectCtx(PROJECT_A_ID), parent.id);

    expect(children.map((task) => task.id)).toEqual([visibleChild.id]);
  });
});
