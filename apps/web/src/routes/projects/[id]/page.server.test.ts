import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  type EventRow,
  type ProjectRow,
} from "@test-support/product-workspace-fixtures.ts";

// Each test seeds the configured default PGlite data directory. `+page.server.ts`
// imports from `sveltekit-superforms/server` so the client barrel is never
// loaded; no SvelteKit virtual stubs are needed in this test.

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-projects-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedOneProject(
  overrides: { slug?: string; name?: string; description?: string | null } = {},
): Promise<{ id: string }> {
  const db = await openIsolatedStore(join(scratch, "pglite.data"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: overrides.slug ?? "alpha",
    name: overrides.name ?? "Alpha",
    description: overrides.description ?? "first project",
  });
  await db.close();
  return { id: project.id };
}

interface RedirectError {
  status: number;
  location: string;
}

function isRedirect(e: unknown): e is RedirectError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    "location" in e &&
    typeof (e as RedirectError).status === "number"
  );
}

describe("/projects/[id] +page.server.ts", () => {
  test("load returns the seeded project + a SuperValidated rename form", async () => {
    const { id } = await seedOneProject({
      slug: "alpha",
      name: "Alpha",
      description: "first project",
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id } } as Parameters<
      typeof mod.load
    >[0]);
    expect(result.project.id).toBe(id);
    expect(result.project.slug).toBe("alpha");
    expect(result.project.name).toBe("Alpha");
    expect(result.project.description).toBe("first project");
    expect(typeof result.project.updated_at).toBe("string");
    expect(result.form?.data?.name).toBe("Alpha");
    expect(result.form?.data?.description).toBe("first project");
  });

  test("load returns task summary metrics for the project only", async () => {
    const db = await openIsolatedStore(join(scratch, "pglite.data"));
    await migrateIsolatedStore(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const alpha = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
    const beta = await createProject(db, { orgId: org.id, slug: "beta", name: "Beta" });
    await createTask(db, { orgId: org.id, projectId: alpha.id, title: "Todo", status: "pending" });
    await createTask(db, { orgId: org.id, projectId: alpha.id, title: "Doing", status: "in_progress" });
    await createTask(db, { orgId: org.id, projectId: alpha.id, title: "Done", status: "completed" });
    await createTask(db, { orgId: org.id, projectId: beta.id, title: "Other", status: "pending" });
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 20}`);
    const result = await mod.load({ params: { id: alpha.id } } as Parameters<
      typeof mod.load
    >[0]);

    expect(result.summary).toEqual({
      openTasks: 2,
      inProgress: 1,
      done: 1,
      sprintDaysRemaining: 0,
    });
  });

  test("rename action updates row + returns { form }", async () => {
    const { id } = await seedOneProject({
      slug: "renamer",
      name: "Old",
      description: "before",
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "NewName");
    fd.set("description", "after");
    const request = new Request("http://localhost/projects/x", {
      method: "POST",
      body: fd,
    });
    const result = await mod.actions.rename({
      params: { id },
      request,
    } as Parameters<typeof mod.actions.rename>[0]);
    expect((result as { form?: unknown }).form).toBeDefined();
    // Re-open the same DB to verify the persisted update.
    const db = await openIsolatedStore(join(scratch, "pglite.data"));
    await migrateIsolatedStore(db);
    try {
      const rows = await db.query<ProjectRow>(
        `SELECT * FROM projects WHERE id = $1`,
        [id],
      );
      expect(rows[0]?.name).toBe("NewName");
      expect(rows[0]?.description).toBe("after");
    } finally {
      await db.close();
    }
  });

  test("load throws 404 when the project id does not exist", async () => {
    // Seed an unrelated project so the DB exists + migrations have run; the
    // bogus ID below is a syntactically-valid ULID that won't match any row.
    await seedOneProject({ slug: "exists", name: "Exists" });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 10}`);
    let caught: unknown;
    try {
      await mod.load({
        params: { id: "01JBOGUS000000000000000000" },
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" &&
        caught !== null &&
        "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("rename action returns fail(400, {form}) when name is empty", async () => {
    const { id } = await seedOneProject({
      slug: "renamer-empty",
      name: "Existing",
      description: "before",
    });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 11}`);
    const fd = new FormData();
    fd.set("name", "");
    fd.set("description", "anything");
    const request = new Request("http://localhost/projects/x", {
      method: "POST",
      body: fd,
    });
    // SvelteKit's `fail(400, { form })` returns an ActionFailure object
    // (not a thrown error). It carries `status === 400` and `data.form`
    // (the SuperValidated envelope with `valid: false` + populated errors).
    const result = (await mod.actions.rename({
      params: { id },
      request,
    } as Parameters<typeof mod.actions.rename>[0])) as {
      status?: number;
      data?: { form?: { valid?: boolean; errors?: Record<string, unknown> } };
    };
    expect(result.status).toBe(400);
    expect(result.data?.form).toBeDefined();
    expect(result.data?.form?.valid).toBe(false);
    expect(result.data?.form?.errors).toBeDefined();
  });

  test("delete action deletes row, emits project.deleted, throws redirect 303 to /projects", async () => {
    const { id } = await seedOneProject({ slug: "doomed", name: "Doomed" });
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let caught: unknown;
    try {
      await mod.actions.delete({ params: { id } } as Parameters<
        typeof mod.actions.delete
      >[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isRedirect(caught)).toBe(true);
    if (isRedirect(caught)) {
      expect(caught.status).toBe(303);
      expect(caught.location).toBe("/projects");
    }
    const db = await openIsolatedStore(join(scratch, "pglite.data"));
    await migrateIsolatedStore(db);
    try {
      const rows = await db.query<ProjectRow>(
        `SELECT * FROM projects WHERE id = $1`,
        [id],
      );
      expect(rows.length).toBe(0);
      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
        [id],
      );
      const deleted = events.find((e) => e.verb === "deleted");
      expect(deleted?.subject_kind).toBe("project");
      expect(deleted?.subject_id).toBe(id);
    } finally {
      await db.close();
    }
  });
});
