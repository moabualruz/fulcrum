import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { Task } from "../../db/entities/tasks/Task.ts";
import { TaskRepository } from "../../db/repositories/tasks/TaskRepository.ts";
import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { createTask, deleteTask, updateTask } from "./commands.ts";
import { getTask, listTasks } from "./queries.ts";
import type { AppContext } from "./types.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

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
});
