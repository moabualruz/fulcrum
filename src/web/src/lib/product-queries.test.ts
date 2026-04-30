import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  groupTasksByStatus,
  listBoardTasks,
  listDocuments,
  listProjects,
  listRuns,
  type BoardTask,
} from "./product-queries.ts";
import { openPglite } from "../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../product-kernel/db/migrate.ts";
import { productDbDir } from "../../../product-kernel/paths.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../product-kernel/ids.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-web-queries-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

async function seed() {
  await Bun.write(join(productDbDir(), ".keep"), "");
  const db = await openPglite(join(productDbDir(), "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Local" });
  const project = await createProject(db, { orgId: org.id, slug: "p1", name: "Alpha" });
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Wire UI", status: "in_progress", priority: 5 });
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Ship docs", status: "pending", priority: 1 });
  const docId = newUlid();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body) VALUES ($1, $2, $3, $4, $5, $6)`,
    [docId, org.id, project.id, "decision", "ADR-0001 PGlite", "use PGlite locally"],
  );
  const runId = newUlid();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, model, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, org.id, project.id, "codex", "gpt-5", "succeeded"],
  );
  await db.close();
  return { project };
}

describe("web product-queries", () => {
  test("listProjects reads real rows from the product DB", async () => {
    const { project } = await seed();
    const rows = await listProjects();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("p1");
    expect(rows[0]?.id).toBe(project.id);
  });

  test("listDocuments returns ordered docs and filters by project", async () => {
    const { project } = await seed();
    const all = await listDocuments();
    const scoped = await listDocuments(project.id);
    expect(all).toHaveLength(1);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.kind).toBe("decision");
  });

  test("listBoardTasks orders by priority desc and groupTasksByStatus buckets correctly", async () => {
    await seed();
    const tasks = await listBoardTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.title).toBe("Wire UI");
    const groups = groupTasksByStatus(tasks);
    expect(groups["in_progress"]).toHaveLength(1);
    expect(groups["pending"]).toHaveLength(1);
    expect(groups["completed"]).toHaveLength(0);
  });

  test("listRuns returns agent run rows backed by agent_runs", async () => {
    const { project } = await seed();
    const runs = await listRuns(project.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.agent).toBe("codex");
    expect(runs[0]?.status).toBe("succeeded");
  });

  test("groupTasksByStatus is pure and stable", () => {
    const fixture: BoardTask[] = [
      { id: "1", title: "a", status: "pending", priority: 0, project_id: null, updated_at: "" },
      { id: "2", title: "b", status: "pending", priority: 0, project_id: null, updated_at: "" },
      { id: "3", title: "c", status: "completed", priority: 0, project_id: null, updated_at: "" },
    ];
    const groups = groupTasksByStatus(fixture);
    expect(groups["pending"]).toHaveLength(2);
    expect(groups["completed"]).toHaveLength(1);
  });
});
