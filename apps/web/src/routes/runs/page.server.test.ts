import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

import { requestServiceScopeMock } from "$lib/test/request-service-scope-mock";

// The `/runs` route resolves its data through `requestServiceScope` and then
// `loadRunsPageData`, which mixes raw-SQL run queries with TypeORM entity
// queries (`listOpenTaskOptions` → `em.find(Task, ...)`). It therefore needs a
// real TypeORM EntityManager — not a raw product-store handle. This test seeds
// a TypeORM-backed store and mocks the scope to return its EntityManager.

let orm: TestOrm | null = null;
let activeCtx: { orgId: string; userId: null } = { orgId: "", userId: null };

// `mock.module` is process-global; this seam answers only while this suite's
// ORM is seeded and falls through to the real resolver for foreign suites.
mock.module("$lib/server/request-service-scope", () =>
  requestServiceScopeMock(() => (orm ? { em: orm.em, ctx: activeCtx } : null)),
);

interface RunsPayload {
  runs: Array<{
    id: string;
    agent: string;
    model: string | null;
    status: string;
    project_id: string | null;
    started_at: string;
    ended_at: string | null;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(async () => {
  orm = await createTestOrm();
  activeCtx = { orgId: orm.seed.orgId, userId: null };
});

afterEach(async () => {
  await orm?.close();
  orm = null;
});

async function seedRuns(): Promise<{ ids: string[] }> {
  const em = orm!.em;
  const [{ id: projectId }] = (await em.query(
    `INSERT INTO projects (id, org_id, slug, name) VALUES (gen_random_uuid(), $1, 'alpha', 'Alpha') RETURNING id`,
    [activeCtx.orgId],
  )) as Array<{ id: string }>;
  const ids: string[] = [];
  const [{ id: r1 }] = (await em.query(
    `INSERT INTO agent_runs (id, org_id, task_id, agent_name, status, started_at)
     VALUES (gen_random_uuid(), $1, NULL, 'claude', 'succeeded', $2) RETURNING id`,
    [activeCtx.orgId, "2026-04-30T10:00:00.000Z"],
  )) as Array<{ id: string }>;
  ids.push(r1);
  const [{ id: r2 }] = (await em.query(
    `INSERT INTO agent_runs (id, org_id, task_id, agent_name, status, started_at)
     VALUES (gen_random_uuid(), $1, NULL, 'codex', 'running', $2) RETURNING id`,
    [activeCtx.orgId, "2026-04-30T11:00:00.000Z"],
  )) as Array<{ id: string }>;
  ids.push(r2);
  void projectId;
  return { ids };
}

describe("/runs +page.server.ts load()", () => {
  test("returns seeded runs unfiltered", async () => {
    const { ids } = await seedRuns();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL("http://localhost/runs"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(2);
    const returnedIds = payload.runs.map((r) => r.id);
    expect(returnedIds).toContain(ids[0]);
    expect(returnedIds).toContain(ids[1]);
    expect(result.filter).toMatchObject({
      agent: "",
      status: "",
      range: "all",
      project: "__any__",
    });
  });

  test("project filter narrows to matching project", async () => {
    await seedRuns();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 9}`);
    const result = await mod.load({
      url: new URL("http://localhost/runs?project=00000000-0000-0000-0000-000000000000"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
    expect(result.filter.project).toBe("00000000-0000-0000-0000-000000000000");
  });

  test("agent filter narrows to matching agent", async () => {
    await seedRuns();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url: new URL("http://localhost/runs?agent=claude"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.agent).toBe("claude");
    expect(result.filter.agent).toBe("claude");
  });

  test("status filter narrows to matching status", async () => {
    await seedRuns();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      url: new URL("http://localhost/runs?status=running"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.status).toBe("running");
  });

  test("returns empty array when DB has no runs", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load({
      url: new URL("http://localhost/runs"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
  });
});
