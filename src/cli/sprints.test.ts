import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
  listSprintTasks,
} from "../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-cli-sprints-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "proj", name: "P" });
  const sprint = await createSprint(db, { orgId: org.id, projectId: project.id, name: "S1" });
  const task = await createTask(db, { orgId: org.id, projectId: project.id, title: "T1" });
  await db.close();
  return { orgId: org.id, projectId: project.id, sprintId: sprint.id, taskId: task.id };
}

describe("CLI: fulcrum sprints", () => {
  test("add-task + remove-task round-trip", async () => {
    const { sprintId, taskId } = await seedDb();
    const mod = await import("./sprints.ts");

    // Capture stdout
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      await mod.run(["add-task", "--sprint-id", sprintId, "--task-id", taskId, "--json"]);
      const addResult = JSON.parse(logs[logs.length - 1]!);
      expect(addResult.ok).toBe(true);

      await mod.run(["remove-task", "--sprint-id", sprintId, "--task-id", taskId, "--json"]);
      const removeResult = JSON.parse(logs[logs.length - 1]!);
      expect(removeResult.ok).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});
