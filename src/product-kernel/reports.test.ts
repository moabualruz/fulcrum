import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import {
  appendEvent,
  createLocalOrg,
  createProject,
  createTask,
} from "./store/repositories.ts";
import { velocity, cycleTime, throughput, wip, cumulativeFlow, burndown } from "./reports.ts";
import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-reports-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

/** Create a completed sprint with metrics_cache rows. */
async function seedSprint(
  db: ProductDb,
  orgId: string,
  projectId: string,
  opts: {
    name: string;
    capacityPoints: number;
    startDate: string;
    endDate: string;
    status?: string;
    dailyMetrics: {
      date: string;
      points_remaining: number;
      points_completed: number;
      tasks_completed: number;
      wip_count: number;
    }[];
  },
) {
  const sprintId = newUlid();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, status, capacity_points, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [sprintId, orgId, projectId, opts.name, opts.status ?? "completed", opts.capacityPoints, opts.startDate, opts.endDate],
  );
  for (const m of opts.dailyMetrics) {
    const mcId = newUlid();
    await db.query(
      `INSERT INTO metrics_cache (id, project_id, sprint_id, date, points_remaining, points_completed, tasks_completed, wip_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [mcId, projectId, sprintId, m.date, m.points_remaining, m.points_completed, m.tasks_completed, m.wip_count],
    );
  }
  return sprintId;
}

describe("reports", () => {
  // ---------- velocity ----------
  test("velocity 3-sprint window — committed vs completed values correct", async () => {
    const db = await freshDb("velocity");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      // 3 completed sprints
      await seedSprint(db, org.id, proj.id, {
        name: "Sprint 1", capacityPoints: 20, startDate: "2026-04-01", endDate: "2026-04-14",
        dailyMetrics: [
          { date: "2026-04-14", points_remaining: 5, points_completed: 15, tasks_completed: 3, wip_count: 0 },
        ],
      });
      await seedSprint(db, org.id, proj.id, {
        name: "Sprint 2", capacityPoints: 25, startDate: "2026-04-15", endDate: "2026-04-28",
        dailyMetrics: [
          { date: "2026-04-28", points_remaining: 0, points_completed: 25, tasks_completed: 5, wip_count: 0 },
        ],
      });
      await seedSprint(db, org.id, proj.id, {
        name: "Sprint 3", capacityPoints: 30, startDate: "2026-04-29", endDate: "2026-05-12",
        dailyMetrics: [
          { date: "2026-05-12", points_remaining: 10, points_completed: 20, tasks_completed: 4, wip_count: 0 },
        ],
      });

      const result = await velocity(db, proj.id, 3);
      expect(result).toHaveLength(3);
      // Ordered by end_date DESC
      expect(result[0]!.sprint_name).toBe("Sprint 3");
      expect(Number(result[0]!.committed_points)).toBe(30);
      expect(Number(result[0]!.completed_points)).toBe(20);
      expect(result[2]!.sprint_name).toBe("Sprint 1");
      expect(Number(result[2]!.committed_points)).toBe(20);
      expect(Number(result[2]!.completed_points)).toBe(15);
    } finally {
      await db.close();
    }
  });

  // ---------- cycle time ----------
  test("cycle-time p50 = median of fixture durations", async () => {
    const db = await freshDb("cycletime");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      // Create 5 tasks with known cycle times: 2h, 4h, 6h, 8h, 10h
      const durations = [2, 4, 6, 8, 10];
      const baseTime = new Date("2026-05-01T00:00:00Z");

      for (let i = 0; i < durations.length; i++) {
        const task = await createTask(db, {
          orgId: org.id, projectId: proj.id,
          title: `Task ${i + 1}`, status: "completed",
        });
        // status_changed to in_progress
        const startedAt = new Date(baseTime.getTime() + i * 86400000);
        await db.query(
          `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
           VALUES ($1, $2, $3, 'agent', 'task', $4, 'status_changed', $5::jsonb, $6)`,
          [newUlid(), org.id, proj.id, task.id, JSON.stringify({ from: "pending", to: "in_progress" }), startedAt.toISOString()],
        );
        // status_changed to completed (durations[i] hours later)
        const completedAt = new Date(startedAt.getTime() + durations[i]! * 3600000);
        await db.query(
          `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
           VALUES ($1, $2, $3, 'agent', 'task', $4, 'status_changed', $5::jsonb, $6)`,
          [newUlid(), org.id, proj.id, task.id, JSON.stringify({ from: "in_progress", to: "completed" }), completedAt.toISOString()],
        );
      }

      const result = await cycleTime(db, proj.id, 365);
      expect(result.items).toHaveLength(5);
      // Sorted: 2, 4, 6, 8, 10 → median (p50) = 6
      expect(result.p50).toBe(6);
      expect(result.p75).toBe(8);
      expect(result.p95).toBe(9.6);
    } finally {
      await db.close();
    }
  });

  // ---------- throughput ----------
  test("throughput 12-week aggregation groups by ISO week correctly", async () => {
    const db = await freshDb("throughput");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      const sprintId = await seedSprint(db, org.id, proj.id, {
        name: "S1", capacityPoints: 10, startDate: "2026-02-02", endDate: "2026-04-26",
        dailyMetrics: [
          // Two entries in same ISO week
          { date: "2026-04-20", points_remaining: 5, points_completed: 3, tasks_completed: 2, wip_count: 1 },
          { date: "2026-04-21", points_remaining: 3, points_completed: 5, tasks_completed: 3, wip_count: 0 },
          // One entry in following week
          { date: "2026-04-27", points_remaining: 0, points_completed: 2, tasks_completed: 1, wip_count: 0 },
        ],
      });

      const result = await throughput(db, proj.id, 12);
      expect(result.length).toBe(2);
      // 2026-04-20 and 2026-04-21 are same ISO week → sum = 5
      expect(result[0]!.tasks_completed).toBe(5);
      // 2026-04-27 → 1
      expect(result[1]!.tasks_completed).toBe(1);
    } finally {
      await db.close();
    }
  });

  // ---------- WIP ----------
  test("WIP sparkline 7 days returns correct data points", async () => {
    const db = await freshDb("wip");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      // Seed 7 days of metrics with varying WIP counts
      const today = new Date();
      const metrics: { date: string; points_remaining: number; points_completed: number; tasks_completed: number; wip_count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        metrics.push({
          date: d.toISOString().slice(0, 10),
          points_remaining: 10 - i, points_completed: i, tasks_completed: 1, wip_count: 3 + i,
        });
      }

      await seedSprint(db, org.id, proj.id, {
        name: "S-wip", capacityPoints: 20,
        startDate: metrics[0]!.date, endDate: metrics[6]!.date,
        dailyMetrics: metrics,
      });

      const result = await wip(db, proj.id);
      expect(result.sparkline).toHaveLength(7);
      expect(result.current_wip).toBe(3); // last day: 3 + 0
      expect(Number(result.sparkline[0]!.wip_count)).toBe(9); // first day: 3 + 6
    } finally {
      await db.close();
    }
  });

  // ---------- CFD ----------
  test("CFD one band per category, correct stacking", async () => {
    const db = await freshDb("cfd");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      // Create 3 tasks directly (skip createTask to avoid now()-timestamped events)
      const taskIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const tid = newUlid();
        taskIds.push(tid);
        await db.query(
          `INSERT INTO tasks (id, org_id, project_id, title, status, priority)
           VALUES ($1, $2, $3, $4, 'pending', 0)`,
          [tid, org.id, proj.id, `T${i}`],
        );
      }
      const t1Id = taskIds[0]!;

      // Day 1 events: all created (pending)
      for (const tid of taskIds) {
        await db.query(
          `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
           VALUES ($1, $2, $3, 'agent', 'task', $4, 'created', $5::jsonb, '2026-05-01')`,
          [newUlid(), org.id, proj.id, tid, JSON.stringify({ status: "pending" })],
        );
      }

      // Day 2: t1 → in_progress
      await db.query(
        `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
         VALUES ($1, $2, $3, 'agent', 'task', $4, 'status_changed', $5::jsonb, '2026-05-02')`,
        [newUlid(), org.id, proj.id, t1Id, JSON.stringify({ from: "pending", to: "in_progress" })],
      );

      // Day 3: t1 → completed
      await db.query(
        `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
         VALUES ($1, $2, $3, 'agent', 'task', $4, 'status_changed', $5::jsonb, '2026-05-03')`,
        [newUlid(), org.id, proj.id, t1Id, JSON.stringify({ from: "in_progress", to: "completed" })],
      );

      // Seed metrics_cache dates as scaffold
      const sprintId = await seedSprint(db, org.id, proj.id, {
        name: "S-cfd", capacityPoints: 10, startDate: "2026-05-01", endDate: "2026-05-03",
        dailyMetrics: [
          { date: "2026-05-01", points_remaining: 10, points_completed: 0, tasks_completed: 0, wip_count: 0 },
          { date: "2026-05-02", points_remaining: 8, points_completed: 2, tasks_completed: 0, wip_count: 1 },
          { date: "2026-05-03", points_remaining: 5, points_completed: 5, tasks_completed: 1, wip_count: 0 },
        ],
      });

      const result = await cumulativeFlow(db, proj.id);
      // 3 dates × 4 categories = 12 rows
      expect(result).toHaveLength(12);

      // Day 1: 3 pending, 0 others
      const day1 = result.filter((r) => r.date === "2026-05-01");
      expect(day1.find((r) => r.status_category === "pending")!.count).toBe(3);
      expect(day1.find((r) => r.status_category === "in_progress")!.count).toBe(0);

      // Day 2: 2 pending, 1 in_progress
      const day2 = result.filter((r) => r.date === "2026-05-02");
      expect(day2.find((r) => r.status_category === "pending")!.count).toBe(2);
      expect(day2.find((r) => r.status_category === "in_progress")!.count).toBe(1);

      // Day 3: 2 pending, 0 in_progress, 1 completed
      const day3 = result.filter((r) => r.date === "2026-05-03");
      expect(day3.find((r) => r.status_category === "pending")!.count).toBe(2);
      expect(day3.find((r) => r.status_category === "completed")!.count).toBe(1);

      // Sum of all categories = total tasks at each date
      for (const date of ["2026-05-01", "2026-05-02", "2026-05-03"]) {
        const dayRows = result.filter((r) => r.date === date);
        const sum = dayRows.reduce((acc, r) => acc + r.count, 0);
        expect(sum).toBe(3);
      }
    } finally {
      await db.close();
    }
  });

  // ---------- burndown ----------
  test("burndown ideal line: day 0 = capacity, day N = 0, linear interpolation", async () => {
    const db = await freshDb("burndown");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      const sprintId = await seedSprint(db, org.id, proj.id, {
        name: "S-burn", capacityPoints: 100, startDate: "2026-05-01", endDate: "2026-05-05",
        dailyMetrics: [
          { date: "2026-05-01", points_remaining: 100, points_completed: 0, tasks_completed: 0, wip_count: 2 },
          { date: "2026-05-02", points_remaining: 80, points_completed: 20, tasks_completed: 2, wip_count: 3 },
          { date: "2026-05-03", points_remaining: 50, points_completed: 50, tasks_completed: 5, wip_count: 1 },
          { date: "2026-05-04", points_remaining: 20, points_completed: 80, tasks_completed: 8, wip_count: 1 },
          { date: "2026-05-05", points_remaining: 0, points_completed: 100, tasks_completed: 10, wip_count: 0 },
        ],
      });

      const result = await burndown(db, proj.id, sprintId);
      expect(result).toHaveLength(5);

      // Day 0 (2026-05-01): ideal = 100 * (4/4) = 100
      expect(result[0]!.ideal).toBe(100);
      expect(result[0]!.points_remaining).toBe(100);

      // Day 1 (2026-05-02): ideal = 100 * (3/4) = 75
      expect(result[1]!.ideal).toBe(75);
      expect(result[1]!.points_remaining).toBe(80);

      // Day 2 (2026-05-03): ideal = 100 * (2/4) = 50
      expect(result[2]!.ideal).toBe(50);

      // Day 4 (2026-05-05): ideal = 100 * (0/4) = 0
      expect(result[4]!.ideal).toBe(0);
      expect(result[4]!.points_remaining).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("burndown fallback returns same shape when cache empty", async () => {
    const db = await freshDb("burndown-fallback");
    try {
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const proj = await createProject(db, { orgId: org.id, slug: "p", name: "P" });

      // Sprint with no metrics_cache rows
      const sprintId = newUlid();
      await db.query(
        `INSERT INTO sprints (id, org_id, project_id, name, status, capacity_points, start_date, end_date)
         VALUES ($1, $2, $3, 'S-empty', 'completed', 10, '2026-05-01', '2026-05-03')`,
        [sprintId, org.id, proj.id],
      );

      const result = await burndown(db, proj.id, sprintId);
      // 3 days: May 1, 2, 3
      expect(result).toHaveLength(3);
      expect(result[0]!.date).toBe("2026-05-01");
      expect(result[0]!.ideal).toBe(10); // capacity at day 0
      expect(result[2]!.ideal).toBe(0); // 0 at last day
      // All have the required shape
      for (const row of result) {
        expect(row).toHaveProperty("date");
        expect(row).toHaveProperty("points_remaining");
        expect(row).toHaveProperty("ideal");
      }
    } finally {
      await db.close();
    }
  });
});
