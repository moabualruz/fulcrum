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
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-settings-fields-"));
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

describe("/projects/[id]/settings/fields +page.server.ts", () => {
  test("load returns empty fields list for new project", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.fields).toEqual([]);
    expect(result.projectId).toBe(id);
  });

  test("create action adds a field, load returns it", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "Priority");
    fd.set("fieldType", "text");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    const result = await mod.actions.create({
      params: { id },
      request,
    } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { success?: boolean }).success).toBe(true);

    const loadResult = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(loadResult.fields).toHaveLength(1);
    expect(loadResult.fields[0].name).toBe("Priority");
    expect(loadResult.fields[0].field_type).toBe("text");
  });

  test("archive action hides field from list", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    // Create field
    const fd = new FormData();
    fd.set("name", "Size");
    fd.set("fieldType", "select");
    fd.set("options", "S,M,L");
    await mod.actions.create({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);

    const afterCreate = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(afterCreate.fields).toHaveLength(1);
    const fieldId = afterCreate.fields[0].id;

    // Archive it
    const archiveFd = new FormData();
    archiveFd.set("id", fieldId);
    await mod.actions.archive({
      request: new Request("http://localhost", { method: "POST", body: archiveFd }),
    } as Parameters<typeof mod.actions.archive>[0]);

    const afterArchive = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(afterArchive.fields).toHaveLength(0);
  });

  test("create with empty name returns fail 400", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("name", "");
    fd.set("fieldType", "text");
    const result = await mod.actions.create({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { status?: number }).status).toBe(400);
  });
});
