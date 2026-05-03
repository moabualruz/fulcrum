import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run as runProduct } from "./product.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
  createCustomField,
  createSavedView,
  updateTask,
} from "../product-kernel/store/repositories.ts";
import { indexSearchDocument } from "../product-kernel/search.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-product-cli-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, restore: () => { console.log = original; } };
}

describe("fulcrum product CLI", () => {
  test("product init --json reports engine and creates the local org", async () => {
    const cap = captureStdout();
    try {
      await runProduct(["init", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.engine).toBe("pglite");
    expect(payload.org.slug).toBe("default");
    expect(payload.org.created).toBe(true);
  });

  test("product projects list --json returns inserted projects", async () => {
    // Seed via direct db access at the same path the CLI will open.
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["projects", "list", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].slug).toBe("alpha");
  });

  test("product search returns FTS hits as JSON", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel overview",
        body: "fulcrum product kernel notes",
      });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].source_id).toBe("d1");
  });

  test("product search treats flag values as flag values regardless of order", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel",
        body: "kernel",
      });
    } finally {
      await db.close();
    }
    // Flag-before-positional: query must be the trailing positional.
    let cap = captureStdout();
    try {
      await runProduct(["search", "--org-slug", "default", "kernel", "--json"]);
    } finally {
      cap.restore();
    }
    const flagFirst = JSON.parse(cap.lines.join("\n"));
    expect(flagFirst).toHaveLength(1);
    expect(flagFirst[0].source_id).toBe("d1");

    // Positional-before-flag must produce identical output.
    cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--org-slug", "default", "--json"]);
    } finally {
      cap.restore();
    }
    const positionalFirst = JSON.parse(cap.lines.join("\n"));
    expect(positionalFirst).toEqual(flagFirst);
  });

  test("product search --kind filters by source kind", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "kernel task item",
        body: "kernel task body",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel doc item",
        body: "kernel doc body",
      });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["search", "kernel", "--kind", "task", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].source_kind).toBe("task");
  });

  // ── P14#06: projects/tasks/sprints integration tests ──────────────

  test("product projects list --json → Project[] shape; empty org → []", async () => {
    const cap = captureStdout();
    try {
      await runProduct(["init", "--json"]); // seed org+migrations
    } finally {
      cap.restore();
    }
    const cap2 = captureStdout();
    try {
      await runProduct(["projects", "list", "--json"]);
    } finally {
      cap2.restore();
    }
    const payload = JSON.parse(cap2.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(0);
  });

  test("product tasks create --title T --project P --json → task created", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["tasks", "create", "--title", "Fix bug", "--project", "alpha", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.id).toBeDefined();
    expect(payload.title).toBe("Fix bug");
    expect(payload.status).toBe("pending");
  });

  test("product tasks list --status open --json → filters applied; shape correct", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await createTask(db, { orgId: org.id, projectId: proj.id, title: "Open task", status: "pending" });
      await createTask(db, { orgId: org.id, projectId: proj.id, title: "Done task", status: "completed" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["tasks", "list", "--status", "open", "--project", "p", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].title).toBe("Open task");
    expect(payload[0].status).toBe("pending");
  });

  test("product tasks update <id> --status done --json → task status updated; events row inserted", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let taskId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T1" });
      taskId = task.id;
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["tasks", "update", taskId, "--status", "done", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.id).toBe(taskId);
    expect(payload.status).toBe("completed");
    // Verify event row inserted
    const db2 = await openPglite(dbPath);
    try {
      const events = await db2.query<{ verb: string; subject_id: string }>(
        `SELECT verb, subject_id FROM events WHERE subject_kind = 'task' AND subject_id = $1 AND verb = 'updated'`,
        [taskId],
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
    } finally {
      await db2.close();
    }
  });

  test("product tasks bulk <ids> --status done --json → bulk update", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let id1 = "", id2 = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const t1 = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T1" });
      const t2 = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T2" });
      id1 = t1.id;
      id2 = t2.id;
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["tasks", "bulk", `${id1},${id2}`, "--status", "done", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(2);
    expect(payload[0].status).toBe("completed");
    expect(payload[1].status).toBe("completed");
  });

  test("product tasks move <id> --sprint <S> --json → task sprint updated", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let taskId = "", sprintId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T1" });
      const sprint = await createSprint(db, { orgId: org.id, projectId: proj.id, name: "Sprint 1" });
      taskId = task.id;
      sprintId = sprint.id;
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["tasks", "move", taskId, "--sprint", sprintId, "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.id).toBe(taskId);
    expect(payload.sprint_id).toBe(sprintId);
  });

  test("product sprints list --project P --json → Sprint[]", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await createSprint(db, { orgId: org.id, projectId: proj.id, name: "Sprint 1" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["sprints", "list", "--project", "p", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].name).toBe("Sprint 1");
    expect(payload[0].status).toBe("planning");
  });

  test("product sprints activate <id> --json → sprint status='active'; error on already-active", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let sprintId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const sprint = await createSprint(db, { orgId: org.id, projectId: proj.id, name: "Sprint 1" });
      sprintId = sprint.id;
    } finally {
      await db.close();
    }
    // First activation succeeds
    const cap = captureStdout();
    try {
      await runProduct(["sprints", "activate", sprintId, "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.id).toBe(sprintId);
    expect(payload.status).toBe("active");
    // Second activation should error (already active)
    const cap2 = captureStdout();
    const origExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => { exitCode = code; }) as never;
    try {
      await runProduct(["sprints", "activate", sprintId, "--json"]);
    } finally {
      cap2.restore();
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
    const errPayload = JSON.parse(cap2.lines.join("\n"));
    expect(errPayload.error).toContain("already active");
  });

  test("product sprints complete <id> --json → sprint status='completed'; velocity rollup", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let sprintId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const sprint = await createSprint(db, { orgId: org.id, projectId: proj.id, name: "Sprint 1", status: "active" });
      sprintId = sprint.id;
      // Create two tasks in this sprint, one completed
      const t1 = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T1", status: "completed" });
      await db.query(`UPDATE tasks SET sprint_id = $1 WHERE id = $2`, [sprintId, t1.id]);
      const t2 = await createTask(db, { orgId: org.id, projectId: proj.id, title: "T2", status: "pending" });
      await db.query(`UPDATE tasks SET sprint_id = $1 WHERE id = $2`, [sprintId, t2.id]);
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["sprints", "complete", sprintId, "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.id).toBe(sprintId);
    expect(payload.status).toBe("completed");
    expect(payload.velocity).toBe(1); // only 1 completed task
  });

  test("product custom-fields list --project P --json → CustomField[]", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await createCustomField(db, { orgId: org.id, projectId: proj.id, name: "Priority Level", fieldType: "select" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["custom-fields", "list", "--project", "p", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].name).toBe("Priority Level");
    expect(payload[0].field_type).toBe("select");
  });

  test("product saved-views list --project P --json → SavedView[]", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await createSavedView(db, { orgId: org.id, projectId: proj.id, name: "My Board" });
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["saved-views", "list", "--project", "p", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0].name).toBe("My Board");
  });

  test("product context assemble --task <id> renders ordered Markdown", async () => {
    const dbPath = join(productDbDir(), "main");
    await Bun.write(join(productDbDir(), ".keep"), "");
    const db = await openPglite(dbPath);
    let taskId = "";
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "default", name: "Local" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Wire kernel CLI",
      });
      taskId = task.id;
    } finally {
      await db.close();
    }
    const cap = captureStdout();
    try {
      await runProduct(["context", "assemble", "--task", taskId]);
    } finally {
      cap.restore();
    }
    const text = cap.lines.join("\n");
    expect(text).toContain("## Task");
    expect(text).toContain("Wire kernel CLI");
  });
});
