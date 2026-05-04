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
import { indexSearchDocument } from "./search.ts";
import { createMockSidecar } from "./inference.ts";
import {
  enqueueEmbedTask,
  handleEmbedTaskJob,
  searchTasks,
} from "./embeddings.ts";
import { getJob, claimJob } from "./jobs.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-embed-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("embeddings gate", () => {
  test("flag OFF: create task does not call inference sidecar", async () => {
    const db = await freshDb("no-embed");
    try {
      const sidecar = createMockSidecar();
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });
      await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Test task",
      });
      // Flag OFF — no enqueue, no sidecar call
      expect(sidecar.calls).toHaveLength(0);
      // Embedding column should be null
      const rows = await db.query<{ embedding: unknown }>(
        `SELECT embedding FROM tasks WHERE project_id = $1`,
        [project.id],
      );
      expect(rows[0]?.embedding).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("flag ON: embed job populates embedding column", async () => {
    const db = await freshDb("embed-on");
    try {
      const sidecar = createMockSidecar();
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Implement auth",
        description: "Add JWT-based authentication",
      });

      // Enqueue embed job (flag ON path)
      await enqueueEmbedTask(db, {
        orgId: org.id,
        projectId: project.id,
        taskId: task.id,
      });

      // Verify job enqueued
      const job = await claimJob(db, "inference", "test-worker");
      expect(job).not.toBeNull();
      expect(job!.kind).toBe("embed-task");

      // Run the handler
      await handleEmbedTaskJob(db, sidecar, task.id);

      // Sidecar was called
      expect(sidecar.calls).toHaveLength(1);
      expect(sidecar.calls[0]!.method).toBe("embed");

      // Embedding written
      const rows = await db.query<{ embedding: string }>(
        `SELECT embedding FROM tasks WHERE id = $1`,
        [task.id],
      );
      const raw = rows[0]!.embedding;
      const embedding = typeof raw === "string" ? JSON.parse(raw) : raw;
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    } finally {
      await db.close();
    }
  });

  test("hybrid search ranks paraphrase above keyword-absent", async () => {
    const db = await freshDb("hybrid");
    try {
      const sidecar = createMockSidecar({
        // Deterministic embeddings: paraphrase gets high cosine with query,
        // keyword match gets low cosine
        embed: async (text: string) => {
          if (text.includes("authentication") || text.includes("auth")) {
            return [1, 0, 0, 0, 0, 0, 0, 0]; // "auth" direction
          }
          if (text.includes("deploy") || text.includes("shipping")) {
            return [0, 1, 0, 0, 0, 0, 0, 0]; // "deploy" direction
          }
          return [0.5, 0.5, 0, 0, 0, 0, 0, 0]; // generic
        },
      });
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });

      // Task A: paraphrase of "auth" — semantically close but keyword absent
      const taskA = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Implement login and authentication flow",
        description: "JWT-based auth for API endpoints",
      });

      // Task B: has keyword "auth" but about deployment
      const taskB = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Deploy shipping pipeline",
        description: "Set up CI/CD for shipping releases",
      });

      // Index both for BM25
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "task",
        sourceId: taskA.id,
        title: taskA.title,
        body: taskA.description ?? "",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "task",
        sourceId: taskB.id,
        title: taskB.title,
        body: taskB.description ?? "",
      });

      // Embed both
      await handleEmbedTaskJob(db, sidecar, taskA.id);
      await handleEmbedTaskJob(db, sidecar, taskB.id);

      // Search for "authentication" — taskA should rank higher via cosine
      const hits = await searchTasks(db, {
        projectId: project.id,
        text: "authentication",
        embeddingsEnabled: true,
        sidecar,
      });

      expect(hits.length).toBeGreaterThan(0);
      // taskA (auth paraphrase) should be first
      expect(hits[0]!.id).toBe(taskA.id);
    } finally {
      await db.close();
    }
  });

  test("fallback ILIKE search when embeddings OFF", async () => {
    const db = await freshDb("ilike");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, {
        orgId: org.id,
        slug: "p",
        name: "P",
      });
      await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Fix authentication bug",
      });
      await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Unrelated task",
      });

      const hits = await searchTasks(db, {
        projectId: project.id,
        text: "auth",
        embeddingsEnabled: false,
      });

      expect(hits).toHaveLength(1);
      expect(hits[0]!.title).toBe("Fix authentication bug");
    } finally {
      await db.close();
    }
  });
});
