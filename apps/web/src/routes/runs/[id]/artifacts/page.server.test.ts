import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { closeDatabase } from "$lib/server/db";
import { applicationScopeMock, useApplicationScope } from "$lib/test/application-scope-mock";

let scratch: string;
let activeDb: TestStore | null = null;
let activeOrgId = "";
let activeProjectId: string | null = null;

// `mock.module` is process-wide and only one factory closure survives per
// path. `applicationScopeMock()` routes through a shared seam slot; this suite
// publishes its `activeDb`-backed seam while active (beforeAll/afterAll) so
// sibling suites that mock the same path are never hijacked. The seam reads
// `activeDb` live, so it answers `null` between tests and lets foreign suites
// fall through to the real resolver.
mock.module("$lib/server/application-scope", () => applicationScopeMock());

interface Payload {
  artifacts: Array<{
    id: string;
    run_id: string | null;
    title: string;
    size: number | null;
    created_at: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function makeEvent(runId: string, apiFetch: typeof fetch) {
  const url = new URL(`http://localhost/runs/${runId}/artifacts`);
  return {
    params: { id: runId },
    url,
    request: new Request(url),
    fetch: apiFetch,
    locals: { activeProjectId: null },
  };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-run-artifacts-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  await activeDb?.close().catch(() => {});
  activeDb = null;
  activeOrgId = "";
  activeProjectId = null;
  await closeDatabase();
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<{ db: TestStore; orgId: string; projectId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  activeDb = db;
  activeOrgId = org.id;
  activeProjectId = project.id;
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(db: TestStore, orgId: string, projectId: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO agent_runs
      (id, org_id, project_id, agent, model, prompt, status)
     VALUES ($1, $2, $3, 'codex', 'gpt-5', 'do thing', 'succeeded')`,
    [id, orgId, projectId],
  );
  return id;
}

describe("/runs/[id]/artifacts +page.server.ts load()", () => {
  let disposeScope: (() => void) | undefined;
  beforeAll(() => {
    disposeScope = useApplicationScope((_locals, projectId) =>
      activeDb
        ? {
            em: activeDb,
            ctx: { orgId: activeOrgId, userId: null, projectId: projectId ?? activeProjectId },
          }
        : null,
    );
  });
  afterAll(() => {
    disposeScope?.();
  });

  test("loads run-scoped artifacts through the public API", async () => {
    const { db, orgId, projectId } = await freshDb();
    const runId = await seedRun(db, orgId, projectId);

    const calls: URL[] = [];
    const apiFetch = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return Response.json([
        {
          id: "artifact-1",
          runId,
          kind: "file",
          title: "output.txt",
          mime: "text/plain",
          sizeBytes: "256",
          createdAt: "2026-05-14T12:00:00.000Z",
        },
      ]);
    }) as unknown as typeof fetch;

    const { load } = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await load(makeEvent(runId, apiFetch) as never);
    expect(result.runId).toBe(runId);
    const payload = await streamedData<Payload>(result);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.pathname).toBe("/api/v1/artifacts");
    expect(calls[0]?.searchParams.get("runId")).toBe(runId);
    expect(calls[0]?.searchParams.get("archived")).toBe("false");
    expect(payload.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        run_id: runId,
        title: "output.txt",
        size: 256,
        created_at: "2026-05-14T12:00:00.000Z",
      }),
    ]);
  });

  test("returns empty when the public API has no artifacts for the run", async () => {
    const { db, orgId, projectId } = await freshDb();
    const runId = await seedRun(db, orgId, projectId);

    const apiFetch = mock(async () => Response.json([])) as unknown as typeof fetch;

    const { load } = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await load(makeEvent(runId, apiFetch) as never);
    const payload = await streamedData<Payload>(result);

    expect(payload.artifacts).toEqual([]);
  });

  test("throws 404 when the run does not exist", async () => {
    await freshDb();
    const apiFetch = mock(async () => Response.json([])) as unknown as typeof fetch;

    const { load } = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await load(makeEvent("01JBOGUS000000000000000000", apiFetch) as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught
        && (caught as { status: number }).status === 404,
    ).toBe(true);
  });
});
