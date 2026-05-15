import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { ArtifactRow, ArtifactStats } from "$lib/server/artifacts";

let scratch: string;

interface Payload {
  artifacts: ArtifactRow[];
  stats: ArtifactStats;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-proj-artifacts-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seed(): Promise<{ projectId: string; artifactIds: string[] }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const ids: string[] = [];

  const a1 = makeId();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, kind, title, mime, size)
     VALUES ($1, $2, $3, 'file', 'report.md', 'text/plain', 1024)`,
    [a1, org.id, project.id],
  );
  ids.push(a1);

  const a2 = makeId();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, kind, title, mime, size)
     VALUES ($1, $2, $3, 'report', 'data.json', 'application/json', 2048)`,
    [a2, org.id, project.id],
  );
  ids.push(a2);

  await db.close();
  return { projectId: project.id, artifactIds: ids };
}

describe("/projects/[id]/artifacts +page.server.ts load()", () => {
  test("returns project-scoped artifacts and stats", async () => {
    const { projectId, artifactIds } = await seed();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: projectId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.projectId).toBe(projectId);
    const payload = await streamedData<Payload>(result);
    expect(payload.artifacts).toHaveLength(2);
    expect(payload.stats.count).toBe(2);
    expect(payload.stats.totalBytes).toBe(3072);
    const returnedIds = payload.artifacts.map((a) => a.id);
    expect(returnedIds).toContain(artifactIds[0]);
    expect(returnedIds).toContain(artifactIds[1]);
  });

  test("returns zero stats when project has no artifacts", async () => {
    const dbDir = join(scratch, "pglite.data");
    mkdirSync(dbDir, { recursive: true });
    const db = await openIsolatedStore(dbDir);
    await migrateIsolatedStore(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const project = await createProject(db, { orgId: org.id, slug: "beta", name: "Beta" });
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: project.id },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<Payload>(result);
    expect(payload.artifacts).toEqual([]);
    expect(payload.stats).toEqual({ count: 0, totalBytes: 0 });
  });
});
