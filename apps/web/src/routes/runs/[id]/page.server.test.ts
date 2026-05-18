import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { closeDatabase } from "$lib/server/db";

let scratch: string;
let activeDb: TestStore | null = null;
let activeOrgId = "";
let activeProjectId: string | null = null;

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId: string | null = null) => {
    if (!activeDb) throw new Error("test database not initialized");
    return {
      em: activeDb,
      ctx: { orgId: activeOrgId, userId: null, projectId: projectId ?? activeProjectId },
    };
  },
}));

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
  artifacts: Array<{
    id: string;
    title: string;
    kind: string;
    downloadHref: string;
    retention_until: string | null;
    lifecycle_state: string;
    preview_kind: string;
    linked_doc_id: string | null;
    promoted_to_memory: boolean;
  }>;
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
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  activeDb = db;
  activeOrgId = org.id;
  activeProjectId = project.id;
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(
  db: TestStore,
  orgId: string,
  projectId: string,
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  transcriptPath: string | null = null,
): Promise<string> {
  const id = randomUUID();
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

function formEvent(id: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return {
    params: { id },
    request: { formData: async () => form },
  };
}

describe("/runs/[id] +page.server.ts", () => {
  test("load returns run + null transcript when transcript_path missing", async () => {
    const { db, orgId, projectId } = await freshDb();
    const id = await seedRun(db, orgId, projectId, "succeeded", null);
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
    const id = await seedRun(db, orgId, projectId, "succeeded", tPath);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.transcript).toBe("hello transcript");
  });

  test("load returns artifacts produced by the run through edges", async () => {
    const { db, orgId, projectId } = await freshDb();
    const id = await seedRun(db, orgId, projectId, "succeeded");
    const artifactId = randomUUID();
    await db.query(
      `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, body_path, mime, metadata_json, retention_until)
       VALUES ($1, $2, $3, $4, 'text', 'summary.txt', '/tmp/summary.txt', 'text/plain',
               '{"previewKind":"markdown","lifecycleState":"linked","linkedDocId":"doc-1","promotedToMemory":true}'::jsonb,
               '2026-06-01T00:00:00.000Z')`,
      [artifactId, orgId, projectId, id],
    );
    await db.query(
      `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
       VALUES ($1, $2, $3, 'agent_run', $4, 'artifact', $5, 'produced')`,
      [makeId(), orgId, projectId, id, artifactId],
    );
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 11}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<RunDetailPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]).toMatchObject({
      id: artifactId,
      title: "summary.txt",
      kind: "text",
      downloadHref: `/artifacts/${artifactId}/download`,
      retention_until: "2026-06-01T00:00:00.000Z",
      lifecycle_state: "linked",
      preview_kind: "markdown",
      linked_doc_id: "doc-1",
      promoted_to_memory: true,
    });
  });

  test("artifact actions archive, link docs, and promote memory metadata", async () => {
    const { db, orgId, projectId } = await freshDb();
    const id = await seedRun(db, orgId, projectId, "succeeded");
    const artifactId = randomUUID();
    await db.query(
      `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, body_path, mime, metadata_json)
       VALUES ($1, $2, $3, $4, 'report', 'handoff.md', 'runs/handoff.md', 'text/markdown', '{}'::jsonb)`,
      [artifactId, orgId, projectId, id],
    );
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 12}`);
    await mod.actions.archiveArtifact(formEvent(id, { artifactId }) as Parameters<typeof mod.actions.archiveArtifact>[0]);
    await mod.actions.linkArtifactToDoc(formEvent(id, { artifactId, docId: "doc-linked" }) as Parameters<typeof mod.actions.linkArtifactToDoc>[0]);
    await mod.actions.promoteArtifactToMemory(formEvent(id, { artifactId }) as Parameters<typeof mod.actions.promoteArtifactToMemory>[0]);

    const rows = await db.query<{ archived: boolean; metadata_json: Record<string, unknown> }>(
      `SELECT archived, metadata_json FROM artifacts WHERE id = $1`,
      [artifactId],
    );
    expect(rows[0]?.archived).toBe(true);
    expect(rows[0]?.metadata_json).toMatchObject({
      lifecycleState: "promoted",
      linkedDocId: "doc-linked",
      promotedToMemory: true,
    });
  });

  test("load throws 404 when run does not exist", async () => {
    await freshDb();
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
    const id = await seedRun(db, orgId, projectId, "running");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    await mod.actions.cancel({ params: { id } } as Parameters<typeof mod.actions.cancel>[0]);
    const rows = await db.query<{ status: string }>(
      `SELECT status FROM agent_runs WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.status).toBe("cancelled");
  });

  test("retry action redirects 303 to new run id", async () => {
    const { db, orgId, projectId } = await freshDb();
    const id = await seedRun(db, orgId, projectId, "failed");
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
