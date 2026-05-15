import { afterEach, describe, expect, test } from "bun:test";

import { createTask } from "@work-management/application/tasks/commands.ts";
import { listTasks } from "@work-management/application/tasks/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import { Project } from "@work-management/infrastructure/database/entities/tasks/Project.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "@test-support/index.ts";
import {
  TaskPublicApiController,
  TaskPublicApiService,
} from "@work-management/interface/http/task-public-api.controller.ts";

let db: TestOrm | null = null;
const previousFeatures = process.env["FULCRUM_FEATURES"];

afterEach(async () => {
  if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
  else process.env["FULCRUM_FEATURES"] = previousFeatures;
  await db?.close();
  db = null;
});

async function api(): Promise<TaskPublicApiController> {
  if (!db) throw new Error("db not initialized");
  process.env["FULCRUM_FEATURES"] = "public-api";
  const container = createTestContainer(db);
  await createLocalCaller({ container, requireSession: true });
  return new TaskPublicApiController(
    new TaskPublicApiService({
      featuresEnv: "public-api",
      application: {
        listTasks: async (input) => {
          return await listTasks(
            db!.em,
            { orgId: input.orgId, userId: input.userId, projectId: input.projectId },
            { includeDeleted: input.includeDeleted },
          );
        },
        createTask: async () => ({ id: "unused" }),
        getTask: async () => null,
        patchTask: async () => null,
        deleteTask: async () => null,
      },
    }),
  );
}

async function createOrgProjectAndSession(db: TestOrm): Promise<{ orgId: string; projectId: string }> {
  const em = db.em;
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const org = em.create(Org, {
    id: orgId,
    name: "REST Parity",
    slug: `rest-parity-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await em.save(org);
  await em.save(Project, {
    id: projectId,
    org,
    name: "REST Parity Project",
    workflowConfig: {},
    enabledTaskTypes: [],
  });
  await em.save(Session, {
    id: `parity-${crypto.randomUUID()}`,
    userId: db.seed.userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: "test",
  });
  return { orgId, projectId };
}

describe("interface REST interface parity", () => {
  test("REST reads application-created tasks by stable id", async () => {
    db = await createTestOrm();
    const { orgId, projectId } = await createOrgProjectAndSession(db);
    const ctx: AppContext = { orgId, userId: db.seed.userId, projectId: null };
    const task = await createTask(db.em, ctx, {
      projectId,
      title: "REST parity task",
      status: "todo",
    });
    const controller = await api();

    const tasks = await controller.listTasks({ orgId, userId: db.seed.userId }) as Array<{
      id: string;
      title: string;
    }>;

    expect(tasks.find((row) => row.id === task.id)).toMatchObject({ title: "REST parity task" });
  });
});
