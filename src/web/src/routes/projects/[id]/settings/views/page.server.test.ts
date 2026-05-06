import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
} from "../../../../../../../test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-settings-views-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ id: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  await db.close();
  return { id: project.id };
}

describe("/projects/[id]/settings/views +page.server.ts", () => {
  test("load returns empty views list", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.views).toEqual([]);
    expect(result.projectId).toBe(id);
  });

  test("create view with filters + set as default", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "High Priority");
    fd.set("scope", "project");
    fd.set("filters", JSON.stringify({ status: "pending", priority: "high" }));
    fd.set("isDefault", "on");
    await mod.actions.create({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.views).toHaveLength(1);
    expect(result.views[0].name).toBe("High Priority");
    expect(result.views[0].is_default).toBe(true);
    expect(result.views[0].filters).toEqual({ status: "pending", priority: "high" });
  });

  test("delete view", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("name", "Temp");
    await mod.actions.create({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const afterCreate = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const delFd = new FormData();
    delFd.set("id", afterCreate.views[0].id);
    await mod.actions.delete({
      request: new Request("http://localhost", { method: "POST", body: delFd }),
    } as Parameters<typeof mod.actions.delete>[0]);

    const afterDelete = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(afterDelete.views).toHaveLength(0);
  });
});
