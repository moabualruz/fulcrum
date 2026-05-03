import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../../../product-kernel/ids.ts";
import type { ArtifactRow } from "$lib/server/artifacts";

let scratch: string;

interface Payload {
  artifacts: ArtifactRow[];
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-run-artifacts-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seed(): Promise<{ runId: string; artifactId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });

  const runId = newUlid();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, status, started_at)
     VALUES ($1, $2, $3, 'claude', 'succeeded', now())`,
    [runId, org.id, project.id],
  );

  const artifactId = newUlid();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, mime, size)
     VALUES ($1, $2, $3, $4, 'file', 'output.txt', 'text/plain', 256)`,
    [artifactId, org.id, project.id, runId],
  );

  // another artifact NOT linked to this run
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, kind, title, mime, size)
     VALUES ($1, $2, $3, 'file', 'other.txt', 'text/plain', 100)`,
    [newUlid(), org.id, project.id],
  );

  await db.close();
  return { runId, artifactId };
}

describe("/runs/[id]/artifacts +page.server.ts load()", () => {
  test("returns only artifacts for the given run", async () => {
    const { runId, artifactId } = await seed();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: runId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.runId).toBe(runId);
    const payload = await streamedData<Payload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]!.id).toBe(artifactId);
  });

  test("returns empty when run has no artifacts", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const runId = newUlid();
    await db.query(
      `INSERT INTO agent_runs (id, org_id, agent, status, started_at)
       VALUES ($1, $2, 'claude', 'succeeded', now())`,
      [runId, org.id],
    );
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: runId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<Payload>(result);
    expect(payload.artifacts).toEqual([]);
  });
});
