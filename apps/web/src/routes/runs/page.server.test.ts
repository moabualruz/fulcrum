import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;

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

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-runs-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedRuns(): Promise<{ ids: string[] }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  const ids: string[] = [];
  // claude / succeeded
  const r1 = makeId();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, model, prompt, status, started_at, ended_at)
     VALUES ($1, $2, $3, 'claude', 'opus', 'p1', 'succeeded', $4, $5)`,
    [r1, org.id, project.id, "2026-04-30T10:00:00.000Z", "2026-04-30T10:30:00.000Z"],
  );
  ids.push(r1);
  // codex / running
  const r2 = makeId();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, model, prompt, status, started_at)
     VALUES ($1, $2, $3, 'codex', 'gpt-5', 'p2', 'running', $4)`,
    [r2, org.id, project.id, "2026-04-30T11:00:00.000Z"],
  );
  ids.push(r2);
  await db.close();
  return { ids };
}

describe("/runs +page.server.ts load()", () => {
  test("returns seeded runs unfiltered", async () => {
    const { ids } = await seedRuns();
    const url = new URL("http://localhost/runs");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(2);
    const returnedIds = payload.runs.map((r) => r.id);
    expect(returnedIds).toContain(ids[0]);
    expect(returnedIds).toContain(ids[1]);
    expect(result.filter).toEqual({
      agent: "",
      status: "",
      range: "all",
      project: "__any__",
    });
  });

  test("project filter narrows to matching project", async () => {
    const { ids: _ids } = await seedRuns();
    void _ids;
    // seedRuns assigns both runs to project "alpha"; assert filter on a
    // non-existent project yields zero rows so we know the column is wired.
    const url = new URL("http://localhost/runs?project=missing");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 9}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
    expect(result.filter.project).toBe("missing");
  });

  test("agent filter narrows to matching agent", async () => {
    await seedRuns();
    const url = new URL("http://localhost/runs?agent=claude");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.agent).toBe("claude");
    expect(result.filter.agent).toBe("claude");
  });

  test("status filter narrows to matching status", async () => {
    await seedRuns();
    const url = new URL("http://localhost/runs?status=running");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.status).toBe("running");
  });

  test("returns empty array when DB has no runs", async () => {
    const dbDir = join(scratch, "pglite.data");
    mkdirSync(dbDir, { recursive: true });
    const db = await openIsolatedStore(dbDir);
    await migrateIsolatedStore(db);
    await db.close();
    const url = new URL("http://localhost/runs");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunsPayload>(result);
    expect(payload.runs).toEqual([]);
  });
});
