import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  appendEvent,
} from "../../../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-proj-activity-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

describe("/projects/[id]/activity +page.server.ts load", () => {
  test("load returns filtered events for project", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const project = await createProject(db, {
      orgId: org.id, slug: "alpha", name: "Alpha",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "status_changed",
    });
    await db.close();

    const { load } = await import("./+page.server.ts");
    const result = load({
      params: { id: project.id },
      url: new URL(`http://localhost/projects/${project.id}/activity`),
      locals: { activeProjectId: null },
    } as any);

    const payload = await streamedData<{
      events: Array<{ id: string; subject_kind: string }>;
    }>(result);
    // createProject auto-emits a "project created" event + our "task status_changed"
    expect(payload.events.length).toBeGreaterThanOrEqual(2);
    expect(payload.events.every((e: any) => e.project_id === project.id)).toBe(true);
  });

  test("load with kind filter narrows results", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const project = await createProject(db, {
      orgId: org.id, slug: "alpha", name: "Alpha",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "doc", subjectId: "d1", verb: "created",
    });
    await db.close();

    const { load } = await import("./+page.server.ts");
    const result = load({
      params: { id: project.id },
      url: new URL(`http://localhost/projects/${project.id}/activity?kind=doc`),
      locals: { activeProjectId: null },
    } as any);

    const payload = await streamedData<{
      events: Array<{ subject_kind: string }>;
    }>(result);
    expect(payload.events.every((e: any) => e.subject_kind === "doc")).toBe(true);
  });
});
