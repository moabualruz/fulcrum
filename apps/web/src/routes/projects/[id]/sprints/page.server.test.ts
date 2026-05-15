import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createSprint,
} from "@test-support/product-workspace-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-sprints-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ projectId: string; orgId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  await createSprint(db, { orgId: org.id, projectId: project.id, name: "Sprint 1", capacity: 20 });
  await db.close();
  return { projectId: project.id, orgId: org.id };
}

describe("/projects/[id]/sprints +page.server.ts", () => {
  test("load returns sprints and velocity data", async () => {
    const { projectId } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id: projectId } } as Parameters<typeof mod.load>[0]);
    expect(result.projectId).toBe(projectId);
    const data = await result.streamed.data;
    expect(data.sprints).toHaveLength(1);
    expect(data.sprints[0].name).toBe("Sprint 1");
    expect(data.velocity).toHaveLength(0); // no completed sprints
  });

  test("createSprint action creates a new sprint", async () => {
    const { projectId } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "Sprint 2");
    fd.set("capacity", "30");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    const result = await mod.actions.createSprint({ request, params: { id: projectId } } as Parameters<typeof mod.actions.createSprint>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);

    // Verify 2 sprints now
    const data = await (await mod.load({ params: { id: projectId } } as Parameters<typeof mod.load>[0])).streamed.data;
    expect(data.sprints).toHaveLength(2);
  });

  test("startSprint action transitions planned → active", async () => {
    const { projectId } = await seedProject();
    const dbDir = join(scratch, "pglite.data");
    const db = await openIsolatedStore(dbDir);
    await migrateIsolatedStore(db);
    const sprints = await db.query<{ id: string }>(`SELECT id FROM sprints WHERE project_id = $1`, [projectId]);
    const sprintId = sprints[0]!.id;
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("id", sprintId);
    const request = new Request("http://localhost", { method: "POST", body: fd });
    const result = await mod.actions.startSprint({ request, params: { id: projectId } } as Parameters<typeof mod.actions.startSprint>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);

    const db2 = await openIsolatedStore(dbDir);
    await migrateIsolatedStore(db2);
    const rows = await db2.query<{ status: string }>(`SELECT status FROM sprints WHERE id = $1`, [sprintId]);
    expect(rows[0]?.status).toBe("active");
    await db2.close();
  });
});
