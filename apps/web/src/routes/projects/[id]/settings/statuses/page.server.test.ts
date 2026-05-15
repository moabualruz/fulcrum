import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
} from "@test-support/product-workspace-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-settings-statuses-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ id: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  await db.close();
  return { id: project.id };
}

describe("/projects/[id]/settings/statuses +page.server.ts", () => {
  test("load returns empty statuses list", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.statuses).toEqual([]);
    expect(result.projectId).toBe(id);
  });

  test("create + delete status cycle", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    // Create
    const fd = new FormData();
    fd.set("name", "In Review");
    fd.set("color", "#3b82f6");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    await mod.actions.create({
      params: { id },
      request,
    } as Parameters<typeof mod.actions.create>[0]);

    const afterCreate = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(afterCreate.statuses).toHaveLength(1);
    expect(afterCreate.statuses[0].name).toBe("In Review");
    expect(afterCreate.statuses[0].color).toBe("#3b82f6");

    // Delete
    const delFd = new FormData();
    delFd.set("id", afterCreate.statuses[0].id);
    await mod.actions.delete({
      request: new Request("http://localhost", { method: "POST", body: delFd }),
    } as Parameters<typeof mod.actions.delete>[0]);

    const afterDelete = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(afterDelete.statuses).toHaveLength(0);
  });

  test("create with isFinal flag", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("name", "Done");
    fd.set("isFinal", "on");
    await mod.actions.create({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.statuses[0].is_final).toBe(true);
  });
});
