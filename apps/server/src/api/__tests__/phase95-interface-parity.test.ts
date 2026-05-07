import { afterEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";

import { createArtifact } from "@/application/artifacts/commands.ts";
import { createSprint } from "@/application/sprints/commands.ts";
import { createTask } from "@/application/tasks/commands.ts";
import type { AppContext } from "@/application/tasks/types.ts";
import { createLocalCaller } from "@fulcrum/cli/local-caller.ts";
import { Org } from "@/db/entities/auth/Org.ts";
import { Session } from "@/db/entities/auth/Session.ts";
import { SearchDocument } from "@/db/entities/search/SearchDocument.ts";
import { Project } from "@/db/entities/tasks/Project.ts";
import { createTestContainer, createTestOrm, type TestOrm } from "@/test-utils/index.ts";
import { createPublicApi } from "../hono.ts";

let db: TestOrm | null = null;
const previousFeatures = process.env["FULCRUM_FEATURES"];

afterEach(async () => {
  if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
  else process.env["FULCRUM_FEATURES"] = previousFeatures;
  await db?.close();
  db = null;
});

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer phase95-parity" };
}

async function api(orgId: string): Promise<ReturnType<typeof createPublicApi>> {
  if (!db) throw new Error("db not initialized");
  process.env["FULCRUM_FEATURES"] = "public-api";
  const container = createTestContainer(db);
  container.bind({ provide: MikroORM, useValue: db.orm });
  const trpc = await createLocalCaller({ container, requireSession: true });
  return createPublicApi({
    db: db.em.fork(),
    trpc,
    apiAuth: {
      findApiKeyByHash: async () => ({
        org_id: orgId,
        user_id: db!.seed.userId,
      }),
    },
  });
}

async function createOrgProjectAndSession(db: TestOrm): Promise<{ orgId: string; projectId: string }> {
  const em = db.em.fork();
  const orgId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const org = em.create(Org, {
    id: orgId,
    name: "REST Parity",
    slug: `rest-parity-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  em.persist(org);
  em.persist(em.create(Project, {
    id: projectId,
    org,
    name: "REST Parity Project",
    workflowConfig: {},
    enabledTaskTypes: [],
  }));
  em.persist(em.create(Session, {
    id: `parity-${crypto.randomUUID()}`,
    userId: db.seed.userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: "test",
  }));
  await em.flush();
  return { orgId, projectId };
}

describe("Phase 09.5 REST interface parity", () => {
  test("REST reads application-created tasks, sprints, artifacts, and search documents by stable id", async () => {
    db = await createTestOrm();
    const { orgId, projectId } = await createOrgProjectAndSession(db);
    const ctx: AppContext = { orgId, userId: db.seed.userId, projectId: null };
    const task = await createTask(db.em.fork(), ctx, {
      projectId,
      title: "REST parity task",
      status: "todo",
    });
    const sprint = await createSprint(db.em.fork(), { ...ctx, projectId }, {
      projectId,
      name: "REST parity sprint",
      goal: "REST reads app sprint",
      startDate: new Date("2026-05-07T00:00:00.000Z"),
      endDate: new Date("2026-05-21T00:00:00.000Z"),
      capacityPoints: 8,
    });
    const artifact = await createArtifact(db.em.fork(), ctx, {
      filename: "rest-parity.txt",
      path: "memory://rest-parity.txt",
      mime: "text/plain",
    });
    const searchEntityId = crypto.randomUUID();
    const searchPhrase = "rest-search-parity";
    const em = db.em.fork();
    em.persist(em.create(SearchDocument, {
      org: em.getReference(Org, orgId),
      entityKind: "task",
      entityId: searchEntityId,
      title: `REST ${searchPhrase}`,
      body: `REST body ${searchPhrase}`,
      projectId,
      status: "todo",
      updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    }));
    await em.flush();

    const router = await api(orgId);

    const tasks = await (await router.request("/tasks", { headers: authHeaders() })).json() as Array<{ id: string; title: string }>;
    const sprints = await (await router.request(`/sprints?project_id=${projectId}`, { headers: authHeaders() })).json() as { data: Array<{ id: string; name: string }> };
    const artifacts = await (await router.request("/artifacts", { headers: authHeaders() })).json() as Array<{ id: string; filename: string }>;
    const search = await (await router.request(`/search?q=${searchPhrase}&kind=task`, { headers: authHeaders() })).json() as Array<{ id: string; title: string }>;

    expect(tasks.find((row) => row.id === task.id)).toMatchObject({ title: "REST parity task" });
    expect(sprints.data.find((row) => row.id === sprint.id)).toMatchObject({ name: "REST parity sprint" });
    expect(artifacts.find((row) => row.id === artifact.id)).toMatchObject({ filename: "rest-parity.txt" });
    expect(search.find((row) => row.id === searchEntityId)).toMatchObject({ title: `REST ${searchPhrase}` });
  });
});
