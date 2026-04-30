import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "./store/repositories.ts";
import { newUlid } from "./ids.ts";
import { assembleContext } from "./context.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-context-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("context assembly", () => {
  test("renders ordered sections and is byte-stable for identical inputs", async () => {
    const db = await openPglite(join(scratch, "ctx"));
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Build kernel",
        description: "do the thing",
      });

      const docId = newUlid();
      await db.query(
        `INSERT INTO documents (id, org_id, project_id, kind, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [docId, org.id, project.id, "spec", "Kernel spec", "spec body"],
      );
      await db.query(
        `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newUlid(), org.id, project.id, "task", task.id, "document", docId, "references"],
      );

      const memId = newUlid();
      await db.query(
        `INSERT INTO memories (id, org_id, project_id, scope, kind, key, body)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [memId, org.id, project.id, "task", "fact", "constraint", "must use PGlite"],
      );
      await db.query(
        `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newUlid(), org.id, project.id, "task", task.id, "memory", memId, "informs"],
      );

      const first = await assembleContext(db, { orgId: org.id, taskId: task.id });
      const second = await assembleContext(db, { orgId: org.id, taskId: task.id });
      expect(first).toBe(second);
      expect(first).toContain("## Task");
      expect(first).toContain("Build kernel");
      expect(first).toContain("## Documents");
      expect(first).toContain("Kernel spec");
      expect(first).toContain("## Memory");
      expect(first).toContain("must use PGlite");
    } finally {
      await db.close();
    }
  });
});
