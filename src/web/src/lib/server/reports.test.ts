import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject } from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  listSprints,
  loadBurndown,
  loadVelocity,
  loadCycleTime,
  loadThroughput,
  loadWip,
  loadCfd,
  loadReports,
} from "./reports.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-reports-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string): Promise<{ db: ProductDb; orgId: string; projectId: string }> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "proj", name: "Proj" });
  return { db, orgId: org.id, projectId: project.id };
}

async function seedSprint(
  db: ProductDb, orgId: string, projectId: string,
  opts: { name: string; startDate: string; endDate: string; status?: string },
): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, orgId, projectId, opts.name, opts.startDate, opts.endDate, opts.status ?? "active"],
  );
  return id;
}

async function seedTask(
  db: ProductDb, orgId: string, projectId: string,
  opts: { status: string; sprintId?: string; storyPoints?: number; title?: string },
): Promise<string> {
  const id = newUlid();
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, status, priority, sprint_id, story_points)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7)`,
    [id, orgId, projectId, opts.title ?? "task", opts.status, opts.sprintId ?? null, opts.storyPoints ?? null],
  );
  return id;
}

async function seedMetric(
  db: ProductDb, orgId: string, projectId: string,
  opts: { sprintId?: string; date: string; kind: string; payload: Record<string, unknown> },
): Promise<void> {
  const id = newUlid();
  await db.query(
    `INSERT INTO metrics_cache (id, org_id, project_id, sprint_id, snapshot_date, metric_kind, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, orgId, projectId, opts.sprintId ?? null, opts.date, opts.kind, JSON.stringify(opts.payload)],
  );
}

async function seedEvent(
  db: ProductDb, orgId: string, projectId: string,
  opts: { taskId: string; verb: string; payload: Record<string, unknown>; createdAt: string },
): Promise<void> {
  const id = newUlid();
  await db.query(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES ($1,$2,$3,'system','task',$4,$5,$6,$7)`,
    [id, orgId, projectId, opts.taskId, opts.verb, JSON.stringify(opts.payload), opts.createdAt],
  );
}

// ---------- listSprints ----------

describe("listSprints", () => {
  test("returns sprints ordered by start_date DESC", async () => {
    const { db, orgId, projectId } = await freshDb("list-sprints");
    try {
      await seedSprint(db, orgId, projectId, { name: "S1", startDate: "2025-01-01", endDate: "2025-01-14" });
      await seedSprint(db, orgId, projectId, { name: "S2", startDate: "2025-01-15", endDate: "2025-01-28" });
      const sprints = await listSprints(db, projectId);
      expect(sprints).toHaveLength(2);
      expect(sprints[0]!.name).toBe("S2");
      expect(sprints[1]!.name).toBe("S1");
    } finally { await db.close(); }
  });
});

// ---------- loadBurndown ----------

describe("loadBurndown", () => {
  test("returns ideal + actual from metrics_cache", async () => {
    const { db, orgId, projectId } = await freshDb("burndown");
    try {
      const sid = await seedSprint(db, orgId, projectId, {
        name: "S1", startDate: "2025-01-01", endDate: "2025-01-03",
      });
      await seedTask(db, orgId, projectId, { status: "pending", sprintId: sid, storyPoints: 6 });
      await seedTask(db, orgId, projectId, { status: "completed", sprintId: sid, storyPoints: 4 });
      await seedMetric(db, orgId, projectId, {
        sprintId: sid, date: "2025-01-01", kind: "burndown", payload: { remaining: 10 },
      });
      await seedMetric(db, orgId, projectId, {
        sprintId: sid, date: "2025-01-02", kind: "burndown", payload: { remaining: 5 },
      });
      const points = await loadBurndown(db, projectId, sid);
      expect(points.length).toBeGreaterThanOrEqual(3); // day 0, 1, 2
      expect(points[0]!.date).toBe("2025-01-01");
      expect(points[0]!.actual).toBe(10);
      expect(points[0]!.ideal).toBe(10);
      // day 2 has data
      expect(points[1]!.actual).toBe(5);
    } finally { await db.close(); }
  });

  test("returns empty for missing sprint", async () => {
    const { db, projectId } = await freshDb("burndown-missing");
    try {
      const result = await loadBurndown(db, projectId, "nonexistent");
      expect(result).toEqual([]);
    } finally { await db.close(); }
  });
});

// ---------- loadVelocity ----------

describe("loadVelocity", () => {
  test("sums completed task points per sprint", async () => {
    const { db, orgId, projectId } = await freshDb("velocity");
    try {
      const s1 = await seedSprint(db, orgId, projectId, {
        name: "S1", startDate: "2025-01-01", endDate: "2025-01-14", status: "completed",
      });
      const s2 = await seedSprint(db, orgId, projectId, {
        name: "S2", startDate: "2025-01-15", endDate: "2025-01-28", status: "completed",
      });
      await seedTask(db, orgId, projectId, { status: "completed", sprintId: s1, storyPoints: 5 });
      await seedTask(db, orgId, projectId, { status: "completed", sprintId: s1, storyPoints: 3 });
      await seedTask(db, orgId, projectId, { status: "pending", sprintId: s1, storyPoints: 2 }); // not completed
      await seedTask(db, orgId, projectId, { status: "completed", sprintId: s2, storyPoints: 7 });

      const bars = await loadVelocity(db, projectId);
      expect(bars).toHaveLength(2);
      // newest first
      expect(bars[0]!.sprint_name).toBe("S2");
      expect(bars[0]!.points).toBe(7);
      expect(bars[1]!.sprint_name).toBe("S1");
      expect(bars[1]!.points).toBe(8);
    } finally { await db.close(); }
  });
});

// ---------- loadCycleTime ----------

describe("loadCycleTime", () => {
  test("computes bins and percentiles from events", async () => {
    const { db, orgId, projectId } = await freshDb("cycle-time");
    try {
      const t1 = await seedTask(db, orgId, projectId, { status: "completed" });
      const t2 = await seedTask(db, orgId, projectId, { status: "completed" });
      // t1: 2 days cycle
      await seedEvent(db, orgId, projectId, {
        taskId: t1, verb: "status_changed",
        payload: { from: "pending", to: "in_progress", task: t1 },
        createdAt: "2025-01-01T00:00:00Z",
      });
      await seedEvent(db, orgId, projectId, {
        taskId: t1, verb: "status_changed",
        payload: { from: "in_progress", to: "completed", task: t1 },
        createdAt: "2025-01-03T00:00:00Z",
      });
      // t2: 5 days cycle
      await seedEvent(db, orgId, projectId, {
        taskId: t2, verb: "status_changed",
        payload: { from: "pending", to: "in_progress", task: t2 },
        createdAt: "2025-01-01T00:00:00Z",
      });
      await seedEvent(db, orgId, projectId, {
        taskId: t2, verb: "status_changed",
        payload: { from: "in_progress", to: "completed", task: t2 },
        createdAt: "2025-01-06T00:00:00Z",
      });

      const stats = await loadCycleTime(db, projectId);
      expect(stats.bins.length).toBeGreaterThan(0);
      expect(stats.p50).toBeGreaterThanOrEqual(2);
      expect(stats.p90).toBeGreaterThanOrEqual(2);
    } finally { await db.close(); }
  });

  test("returns empty stats for no events", async () => {
    const { db, projectId } = await freshDb("cycle-time-empty");
    try {
      const stats = await loadCycleTime(db, projectId);
      expect(stats.bins).toEqual([]);
      expect(stats.p50).toBe(0);
    } finally { await db.close(); }
  });
});

// ---------- loadThroughput ----------

describe("loadThroughput", () => {
  test("counts completed tasks per week", async () => {
    const { db, orgId, projectId } = await freshDb("throughput");
    try {
      const t1 = await seedTask(db, orgId, projectId, { status: "completed" });
      const t2 = await seedTask(db, orgId, projectId, { status: "completed" });
      await seedEvent(db, orgId, projectId, {
        taskId: t1, verb: "status_changed",
        payload: { from: "in_progress", to: "completed", task: t1 },
        createdAt: "2025-01-06T00:00:00Z",
      });
      await seedEvent(db, orgId, projectId, {
        taskId: t2, verb: "status_changed",
        payload: { from: "in_progress", to: "completed", task: t2 },
        createdAt: "2025-01-07T00:00:00Z",
      });

      const points = await loadThroughput(db, projectId);
      expect(points.length).toBeGreaterThan(0);
      // Both in same week
      expect(points[0]!.count).toBe(2);
    } finally { await db.close(); }
  });
});

// ---------- loadWip ----------

describe("loadWip", () => {
  test("reads from metrics_cache wip entries", async () => {
    const { db, orgId, projectId } = await freshDb("wip");
    try {
      await seedMetric(db, orgId, projectId, {
        date: "2025-01-01", kind: "wip",
        payload: { pending: 5, in_progress: 3, blocked: 1 },
      });
      await seedMetric(db, orgId, projectId, {
        date: "2025-01-02", kind: "wip",
        payload: { pending: 4, in_progress: 4, blocked: 0 },
      });
      const points = await loadWip(db, projectId);
      expect(points).toHaveLength(2);
      expect(points[0]!.pending).toBe(5);
      expect(points[1]!.in_progress).toBe(4);
    } finally { await db.close(); }
  });
});

// ---------- loadCfd ----------

describe("loadCfd", () => {
  test("reads from metrics_cache cfd entries", async () => {
    const { db, orgId, projectId } = await freshDb("cfd");
    try {
      await seedMetric(db, orgId, projectId, {
        date: "2025-01-01", kind: "cfd",
        payload: { pending: 10, in_progress: 2, blocked: 0, completed: 1, cancelled: 0 },
      });
      const points = await loadCfd(db, projectId);
      expect(points).toHaveLength(1);
      expect(points[0]!.completed).toBe(1);
    } finally { await db.close(); }
  });
});

// ---------- loadReports (aggregate) ----------

describe("loadReports", () => {
  test("returns all six chart datasets", async () => {
    const { db, orgId, projectId } = await freshDb("reports-agg");
    try {
      const sid = await seedSprint(db, orgId, projectId, {
        name: "S1", startDate: "2025-01-01", endDate: "2025-01-14",
      });
      await seedTask(db, orgId, projectId, { status: "completed", sprintId: sid, storyPoints: 5 });
      const data = await loadReports(db, projectId, sid);
      expect(data.sprints).toHaveLength(1);
      expect(data).toHaveProperty("burndown");
      expect(data).toHaveProperty("velocity");
      expect(data).toHaveProperty("cycleTime");
      expect(data).toHaveProperty("throughput");
      expect(data).toHaveProperty("wip");
      expect(data).toHaveProperty("cfd");
    } finally { await db.close(); }
  });

  test("returns empty-safe data when no sprints", async () => {
    const { db, projectId } = await freshDb("reports-empty");
    try {
      const data = await loadReports(db, projectId);
      expect(data.sprints).toEqual([]);
      expect(data.burndown).toEqual([]);
      expect(data.cycleTime.bins).toEqual([]);
    } finally { await db.close(); }
  });
});
