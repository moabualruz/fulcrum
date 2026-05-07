import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg, createProject } from "@/test-support/product-fixtures.ts";
import { makeId } from "@/test-support/product-fixtures.ts";
import type { ArtifactRow } from "$lib/server/artifacts";

let scratch: string;

interface ArtifactsPayload {
  artifacts: ArtifactRow[];
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-artifacts-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedArtifacts(): Promise<{ ids: string[]; orgId: string; projectId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const ids: string[] = [];

  const a1 = makeId();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, kind, title, mime, size)
     VALUES ($1, $2, $3, 'file', 'report.md', 'text/plain', 2048)`,
    [a1, org.id, project.id],
  );
  ids.push(a1);

  const a2 = makeId();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, kind, title, mime, size)
     VALUES ($1, $2, $3, 'report', 'data.json', 'application/json', 512)`,
    [a2, org.id, project.id],
  );
  ids.push(a2);

  await db.close();
  return { ids, orgId: org.id, projectId: project.id };
}

describe("/artifacts +page.server.ts load()", () => {
  test("returns seeded artifacts unfiltered", async () => {
    const { ids } = await seedArtifacts();
    const url = new URL("http://localhost/artifacts");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toHaveLength(2);
    const returnedIds = payload.artifacts.map((a) => a.id);
    expect(returnedIds).toContain(ids[0]);
    expect(returnedIds).toContain(ids[1]);
  });

  test("mime filter narrows results", async () => {
    await seedArtifacts();
    const url = new URL("http://localhost/artifacts?mime=application/json");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]!.mime).toBe("application/json");
  });

  test("kind filter narrows results", async () => {
    await seedArtifacts();
    const url = new URL("http://localhost/artifacts?kind=report");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]!.kind).toBe("report");
  });

  test("returns empty array when DB has no artifacts", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openIsolatedStore(join(dbDir, "main"));
    await migrateIsolatedStore(db);
    await createLocalOrg(db, { slug: "default", name: "Default" });
    await db.close();
    const url = new URL("http://localhost/artifacts");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load({
      url,
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ArtifactsPayload>(result);
    expect(payload.artifacts).toEqual([]);
  });
});
