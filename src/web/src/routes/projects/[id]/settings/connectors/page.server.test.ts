import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
} from "../../../../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-settings-connectors-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ id: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  await db.close();
  return { id: project.id };
}

describe("/projects/[id]/settings/connectors +page.server.ts", () => {
  test("load returns empty connectors list", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.connectors).toEqual([]);
    expect(result.projectId).toBe(id);
  });

  test("upsert creates connector, second upsert updates it", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    // Create
    const fd = new FormData();
    fd.set("connectorType", "jira");
    fd.set("config", JSON.stringify({ host: "jira.example.com" }));
    await mod.actions.upsert({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    let result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].connector_type).toBe("jira");
    expect(result.connectors[0].enabled).toBe(false);

    // Update (enable)
    const fd2 = new FormData();
    fd2.set("connectorType", "jira");
    fd2.set("enabled", "on");
    fd2.set("config", JSON.stringify({ host: "new.example.com" }));
    await mod.actions.upsert({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd2 }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    result = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].enabled).toBe(true);
  });

  test("sync enabled connector succeeds", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("connectorType", "jira");
    fd.set("enabled", "on");
    await mod.actions.upsert({
      params: { id },
      request: new Request("http://localhost", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.upsert>[0]);

    const loaded = await mod.load({ params: { id } } as Parameters<typeof mod.load>[0]);
    const syncFd = new FormData();
    syncFd.set("id", loaded.connectors[0].id);
    const result = await mod.actions.sync({
      request: new Request("http://localhost", { method: "POST", body: syncFd }),
    } as Parameters<typeof mod.actions.sync>[0]);
    expect((result as { success?: boolean }).success).toBe(true);
  });
});
