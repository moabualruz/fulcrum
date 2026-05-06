import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createSprint,
  createTask,
  addTaskToSprint,
  closeSprint,
} from "../../test-support/product-fixtures.ts";
import type { TestStore } from "../../test-support/product-fixtures.ts";
import {
  handleSprintClosed,
  buildRetroContent,
  type DocsCreateFn,
  type SprintClosedPayload,
} from "./sprint-closed.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-retro-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

/** Set up org + project + sprint with tasks, close the sprint, return event. */
async function setupClosedSprint(db: TestStore) {
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
  const sprint = await createSprint(db, {
    orgId: org.id,
    projectId: project.id,
    name: "Sprint 1",
    goal: "Ship retro feature",
    capacityPoints: 20,
    startDate: "2026-04-21",
    endDate: "2026-05-02",
  });

  // Create tasks: 2 completed (5+3 pts), 1 in_progress (2 pts)
  const t1 = await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "Task A",
    status: "completed",
  });
  const t2 = await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "Task B",
    status: "completed",
  });
  const t3 = await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "Task C",
    status: "in_progress",
  });

  // Assign points and add to sprint
  await db.query(`UPDATE tasks SET estimate_points = 5 WHERE id = $1`, [t1.id]);
  await db.query(`UPDATE tasks SET estimate_points = 3 WHERE id = $1`, [t2.id]);
  await db.query(`UPDATE tasks SET estimate_points = 2 WHERE id = $1`, [t3.id]);

  await addTaskToSprint(db, { sprintId: sprint.id, taskId: t1.id });
  await addTaskToSprint(db, { sprintId: sprint.id, taskId: t2.id });
  await addTaskToSprint(db, { sprintId: sprint.id, taskId: t3.id });

  const result = await closeSprint(db, sprint.id);
  return { org, project, sprint, result };
}

describe("sprint-closed event handler", () => {
  test("creates retro doc with correct doc_type and title for fixture sprint", async () => {
    const db = await freshDb("retro-create");
    try {
      const { result } = await setupClosedSprint(db);

      const handlerResult = await handleSprintClosed(db, result.event);

      expect(handlerResult.skipped).toBe(false);
      expect(handlerResult.retro_doc_id).toBeTruthy();

      // Verify doc in database
      const docs = await db.query<{ id: string; kind: string; title: string; body: string }>(
        `SELECT * FROM documents WHERE id = $1`,
        [handlerResult.retro_doc_id!],
      );
      expect(docs).toHaveLength(1);
      expect(docs[0]!.kind).toBe("postmortem");
      expect(docs[0]!.title).toBe("Retro: Sprint 1");

      // Verify body is TipTap JSON with metrics
      const body = JSON.parse(docs[0]!.body);
      expect(body.type).toBe("doc");
      expect(body.content).toBeArray();
      const texts = body.content
        .flatMap((p: Record<string, unknown[]>) => p.content || [])
        .map((n: Record<string, string>) => n.text);
      expect(texts).toContain("Sprint: Sprint 1");
      expect(texts.some((t: string) => t.includes("Completed: 8 points"))).toBe(true);

      // Verify sprint.retro_doc_id updated
      const sprints = await db.query<{ retro_doc_id: string | null }>(
        `SELECT retro_doc_id FROM sprints WHERE id = $1`,
        [result.sprint.id],
      );
      expect(sprints[0]!.retro_doc_id).toBe(handlerResult.retro_doc_id);
    } finally {
      await db.close();
    }
  });

  test("handler called twice with same event ID creates only one doc (idempotency)", async () => {
    const db = await freshDb("retro-idemp");
    try {
      const { result } = await setupClosedSprint(db);

      const first = await handleSprintClosed(db, result.event);
      const second = await handleSprintClosed(db, result.event);

      expect(first.skipped).toBe(false);
      expect(first.retro_doc_id).toBeTruthy();
      expect(second.skipped).toBe(true);
      expect(second.retro_doc_id).toBeNull();

      // Only one doc created
      const docs = await db.query<{ id: string }>(
        `SELECT id FROM documents WHERE kind = 'postmortem'`,
        [],
      );
      expect(docs).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("handler with unavailable docs.create logs warning, returns without error", async () => {
    const db = await freshDb("retro-nodocs");
    try {
      const { result } = await setupClosedSprint(db);

      // Pass a docsCreate that throws (simulating Pillar 7 not available)
      const failingDocsCreate: DocsCreateFn = async () => {
        throw new Error("docs.create procedure not found");
      };

      const handlerResult = await handleSprintClosed(db, result.event, failingDocsCreate);

      // Should fall back to direct insert, not crash
      expect(handlerResult.skipped).toBe(false);
      expect(handlerResult.retro_doc_id).toBeTruthy();

      const docs = await db.query<{ kind: string }>(
        `SELECT kind FROM documents WHERE id = $1`,
        [handlerResult.retro_doc_id!],
      );
      expect(docs[0]!.kind).toBe("postmortem");
    } finally {
      await db.close();
    }
  });

  test("handler with null docsCreate creates doc directly (Pillar 7 absent)", async () => {
    const db = await freshDb("retro-null-p7");
    try {
      const { result } = await setupClosedSprint(db);

      const handlerResult = await handleSprintClosed(db, result.event, null);

      expect(handlerResult.skipped).toBe(false);
      expect(handlerResult.retro_doc_id).toBeTruthy();
    } finally {
      await db.close();
    }
  });

  test("closeSprint includes metrics snapshot with correct values", async () => {
    const db = await freshDb("retro-metrics");
    try {
      const { result } = await setupClosedSprint(db);

      expect(result.metrics.completed_points).toBe(8);
      expect(result.metrics.completed_tasks).toBe(2);
      expect(result.metrics.total_tasks).toBe(3);
      expect(result.metrics.velocity).toBe(8);
      expect(result.metrics.capacity_points).toBe(20);

      // Event payload includes metrics
      expect(result.event.verb).toBe("closed");
      expect(result.event.payload).toMatchObject({
        name: "Sprint 1",
        metrics_snapshot: { completed_points: 8 },
      });
    } finally {
      await db.close();
    }
  });

  test("closeSprint result includes retro_doc_id null before handler runs", async () => {
    const db = await freshDb("retro-null-before");
    try {
      const { result } = await setupClosedSprint(db);

      // Sprint was closed but handler hasn't run in closeSprint itself
      expect(result.sprint.status).toBe("completed");
      // retro_doc_id is null until handler runs
      expect(result.sprint.retro_doc_id).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("closeSprint on already-closed sprint throws", async () => {
    const db = await freshDb("retro-double-close");
    try {
      const { result } = await setupClosedSprint(db);

      await expect(closeSprint(db, result.sprint.id)).rejects.toThrow("already closed");
    } finally {
      await db.close();
    }
  });
});

describe("buildRetroContent", () => {
  test("produces TipTap JSON with sprint info and metrics", () => {
    const payload: SprintClosedPayload = {
      name: "Sprint 42",
      goal: "Launch v2",
      start_date: "2026-05-01",
      end_date: "2026-05-14",
      metrics_snapshot: {
        capacity_points: 30,
        completed_points: 25,
        total_tasks: 10,
        completed_tasks: 8,
        velocity: 25,
      },
    };

    const result = buildRetroContent(payload);
    expect(result.type).toBe("doc");
    expect(Array.isArray(result.content)).toBe(true);

    const texts = (result.content as Array<{ content?: Array<{ text?: string }> }>)
      .flatMap((p) => p.content ?? [])
      .flatMap((n) => (n.text ? [n.text] : []));

    expect(texts).toContain("Sprint: Sprint 42");
    expect(texts).toContain("Goal: Launch v2");
    expect(texts.some((t: string) => t.includes("2026-05-01"))).toBe(true);
    expect(texts.some((t: string) => t.includes("Completed: 25 points"))).toBe(true);
  });
});
