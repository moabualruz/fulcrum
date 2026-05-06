import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  type EventRow,
} from "../../../../../../test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-project-board-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seed() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const alpha = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const beta = await createProject(db, { orgId: org.id, slug: "beta", name: "Beta" });
  const task = await createTask(db, { orgId: org.id, projectId: alpha.id, title: "Move me", status: "pending" });
  await createTask(db, { orgId: org.id, projectId: beta.id, title: "Other project", status: "pending" });
  await db.close();
  return { alpha, task };
}

describe("/projects/[id]/board +page.server.ts", () => {
  test("load returns tasks scoped to route project id and preserves sprint filter", async () => {
    const { alpha } = await seed();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: alpha.id },
      url: new URL("http://localhost/projects/x/board?sprint=active"),
    } as Parameters<typeof mod.load>[0]);
    expect(result.projectId).toBe(alpha.id);
    expect(result.sprintFilter).toBe("active");
    const payload = await result.streamed.data;
    expect(payload.tasks.map((t) => t.title)).toEqual(["Move me"]);
  });

  test("move action updates task status and emits status_changed event", async () => {
    const { task } = await seed();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("from", "pending");
    fd.set("to", "in_progress");
    const result = await mod.actions.move({
      request: new Request("http://localhost/projects/x/board", { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.move>[0]);
    expect((result as { status?: number }).status ?? 200).toBeLessThan(400);

    const db = await openIsolatedStore(join(scratch, "state", "product", "db", "main"));
    await migrateIsolatedStore(db);
    try {
      const rows = await db.query<{ status: string }>("SELECT status FROM tasks WHERE id = $1", [task.id]);
      expect(rows[0]?.status).toBe("in_progress");
      const events = await db.query<EventRow>(
        "SELECT * FROM events WHERE subject_id = $1 AND verb = 'status_changed'",
        [task.id],
      );
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
