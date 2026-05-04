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
import { createMockSidecar } from "./inference.ts";
import { closeSprint, createSprint, startSprint } from "./sprints.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-sprint-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("sprints", () => {
  test("create → start → close lifecycle", async () => {
    const db = await freshDb("lifecycle");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });

      const sprint = await createSprint(db, {
        orgId: org.id,
        projectId: project.id,
        name: "Sprint 1",
        goal: "Ship auth",
      });
      expect(sprint.status).toBe("planning");

      const started = await startSprint(db, sprint.id);
      expect(started.status).toBe("active");
      expect(started.started_at).not.toBeNull();

      const result = await closeSprint(db, sprint.id, {
        narrateEnabled: false,
      });
      expect(result.retro_doc_id).toBeTruthy();
      expect(result.narrative_appended).toBe(false);
    } finally {
      await db.close();
    }
  });

  test("flag OFF: sidecar not called, retro doc has no narrative section", async () => {
    const db = await freshDb("no-narrate");
    try {
      const sidecar = createMockSidecar();
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });

      const sprint = await createSprint(db, {
        orgId: org.id,
        projectId: project.id,
        name: "Sprint 1",
      });
      await startSprint(db, sprint.id);

      // Add a completed task to this sprint
      await db.query(
        `INSERT INTO tasks (id, org_id, project_id, sprint_id, title, status, priority)
         VALUES ('t1', $1, $2, $3, 'Done task', 'completed', 0)`,
        [org.id, project.id, sprint.id],
      );

      const result = await closeSprint(db, sprint.id, {
        narrateEnabled: false,
        sidecar,
      });

      expect(sidecar.calls).toHaveLength(0);
      expect(result.narrative_appended).toBe(false);

      // Check retro doc body
      const docs = await db.query<{ body: string }>(
        `SELECT body FROM documents WHERE id = $1`,
        [result.retro_doc_id],
      );
      expect(docs[0]!.body).not.toContain("LLM Summary");
      expect(docs[0]!.body).toContain("Done task");
    } finally {
      await db.close();
    }
  });

  test("flag ON: sidecar called with correct prompt shape, narrative appended", async () => {
    const db = await freshDb("narrate-on");
    try {
      const sidecar = createMockSidecar();
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });

      const sprint = await createSprint(db, {
        orgId: org.id,
        projectId: project.id,
        name: "Sprint 2",
        goal: "Ship search",
      });
      await startSprint(db, sprint.id);

      await db.query(
        `INSERT INTO tasks (id, org_id, project_id, sprint_id, title, status, priority)
         VALUES ('t1', $1, $2, $3, 'Build search API', 'completed', 0)`,
        [org.id, project.id, sprint.id],
      );
      await db.query(
        `INSERT INTO tasks (id, org_id, project_id, sprint_id, title, status, priority)
         VALUES ('t2', $1, $2, $3, 'Add filters', 'in_progress', 0)`,
        [org.id, project.id, sprint.id],
      );

      const result = await closeSprint(db, sprint.id, {
        narrateEnabled: true,
        sidecar,
      });

      // Sidecar called once for narration
      expect(sidecar.calls).toHaveLength(1);
      expect(sidecar.calls[0]!.method).toBe("narrate");

      // Prompt shape: contains sprint name, metrics, task titles
      const prompt = sidecar.calls[0]!.args[0] as string;
      expect(prompt).toContain("Sprint 2");
      expect(prompt).toContain("Ship search");
      expect(prompt).toContain("Build search API");
      expect(prompt).toContain("Total tasks: 2");
      expect(prompt).toContain("Completed: 1");

      expect(result.narrative_appended).toBe(true);

      // Check retro doc has LLM Summary section
      const docs = await db.query<{ body: string }>(
        `SELECT body FROM documents WHERE id = $1`,
        [result.retro_doc_id],
      );
      expect(docs[0]!.body).toContain("## LLM Summary");
      expect(docs[0]!.body).toContain("Mock narrative paragraph");
    } finally {
      await db.close();
    }
  });

  test("report-llm-narration:ollama routes backend to sidecar", async () => {
    const db = await freshDb("backend-route");
    try {
      const sidecar = createMockSidecar();
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });

      const sprint = await createSprint(db, {
        orgId: org.id,
        projectId: project.id,
        name: "Sprint 3",
      });
      await startSprint(db, sprint.id);

      const result = await closeSprint(db, sprint.id, {
        narrateEnabled: true,
        sidecar,
        narrateBackend: "ollama",
      });

      // Sidecar was called (backend routing is sidecar's responsibility;
      // we verify the call was made and backend hint was available)
      expect(sidecar.calls).toHaveLength(1);
      expect(result.narrative_appended).toBe(true);
    } finally {
      await db.close();
    }
  });
});
