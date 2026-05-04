import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../../product-kernel/db/types.ts";

let scratch: string;

interface RunDetailPayload {
  run: {
    id: string;
    org_id: string;
    project_id: string | null;
    agent: string;
    model: string | null;
    prompt: string | null;
    status: string;
    parent_run_id: string | null;
    started_at: string;
    ended_at: string | null;
    transcript_path: string | null;
  };
  transcript: string | null;
  artifacts: Array<{ id: string; title: string; kind: string; downloadHref: string }>;
  events: Array<{ id: string; created_at: string }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-runs-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<{ db: ProductDb; orgId: string; projectId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(
  db: ProductDb,
  orgId: string,
  projectId: string,
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  transcriptPath: string | null = null,
): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO agent_runs
      (id, org_id, project_id, agent, model, prompt, status, transcript_path)
     VALUES ($1, $2, $3, 'codex', 'gpt-5', 'do thing', $4, $5)`,
    [id, orgId, projectId, status, transcriptPath],
  );
  return id;
}

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(e: unknown): e is RedirectError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    "location" in e &&
    typeof (e as RedirectError).status === "number"
  );
}

describe("/runs/[id] +page.server.ts", () => {
  test("load returns run + null transcript when transcript_path missing", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "succeeded", null);
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.run.id).toBe(id);
    expect(payload.run.status).toBe("succeeded");
    expect(payload.transcript).toBeNull();
    expect(Array.isArray(payload.events)).toBe(true);
  });

  test("load reads transcript file content when transcript_path is set", async () => {
    const { db, orgId, projectId } = await freshDb();
    const tPath = join(scratch, "transcript.txt");
    writeFileSync(tPath, "hello transcript", "utf8");
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "succeeded", tPath);
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.transcript).toBe("hello transcript");
  });

  test("load returns artifacts produced by the run through edges", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    let artifactId: string;
    try {
      id = await seedRun(db, orgId, projectId, "succeeded");
      artifactId = newUlid();
      await db.query(
        `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, body_path, mime)
         VALUES ($1, $2, $3, $4, 'text', 'summary.txt', '/tmp/summary.txt', 'text/plain')`,
        [artifactId, orgId, projectId, id],
      );
      await db.query(
        `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
         VALUES ($1, $2, $3, 'agent_run', $4, 'artifact', $5, 'produced')`,
        [newUlid(), orgId, projectId, id, artifactId],
      );
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 11}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]).toMatchObject({
      id: artifactId,
      title: "summary.txt",
      kind: "text",
      downloadHref: `/artifacts/${artifactId}/download`,
    });
  });

  test("load throws 404 when run does not exist", async () => {
    const { db } = await freshDb();
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      const result = await mod.load({ params: { id: "01JBOGUS000000000000000000" } } as Parameters<typeof mod.load>[0]);
      await streamedData<RunDetailPayload>(result);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught
        && (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("cancel action transitions run row to cancelled", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "running");
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    await mod.actions.cancel({ params: { id } } as Parameters<typeof mod.actions.cancel>[0]);
    const dbDir = join(scratch, "state", "product", "db");
    const db2 = await openPglite(join(dbDir, "main"));
    await runMigrations(db2);
    try {
      const rows = await db2.query<{ status: string }>(
        `SELECT status FROM agent_runs WHERE id = $1`,
        [id],
      );
      expect(rows[0]?.status).toBe("cancelled");
    } finally {
      await db2.close();
    }
  });

  test("retry action redirects 303 to new run id", async () => {
    const { db, orgId, projectId } = await freshDb();
    let id: string;
    try {
      id = await seedRun(db, orgId, projectId, "failed");
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    let caught: unknown;
    try {
      await mod.actions.retry({ params: { id } } as Parameters<typeof mod.actions.retry>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toMatch(/^\/runs\/[A-Z0-9]+$/);
      expect(caught.location).not.toBe(`/runs/${id}`);
    }
  });
});
