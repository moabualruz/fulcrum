import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg, createProject } from "@/test-support/product-fixtures.ts";
import { makeId } from "@/test-support/product-fixtures.ts";
import type { TestStore } from "@/test-support/product-fixtures.ts";
import { loadDashboard } from "./dashboard.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-dashboard-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, orgId: org.id };
}

async function seedTask(
  db: TestStore, orgId: string, projectId: string | null,
  status: string, priority: number, title = "task",
): Promise<string> {
  const id = makeId();
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, status, priority) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, orgId, projectId, title, status, priority],
  );
  return id;
}

async function seedDoc(
  db: TestStore, orgId: string, projectId: string | null,
  title: string, updatedAt: string, kind = "note",
): Promise<string> {
  const id = makeId();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, orgId, projectId, kind, title, "body", updatedAt],
  );
  return id;
}

async function seedRun(
  db: TestStore, orgId: string, projectId: string | null,
  startedAt: string, agent = "codex", status = "succeeded",
): Promise<string> {
  const id = makeId();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, status, started_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, orgId, projectId, agent, status, startedAt],
  );
  return id;
}

const DAY = 24 * 60 * 60 * 1000;

describe("loadDashboard", () => {
  test("counters reflect seeded data scoped to org", async () => {
    const { db, orgId } = await freshDb("counters");
    try {
      const pA = await createProject(db, { orgId, slug: "a", name: "A" });
      await createProject(db, { orgId, slug: "b", name: "B" });
      await seedTask(db, orgId, pA.id, "completed", 0);
      await seedTask(db, orgId, pA.id, "pending", 1);
      await seedTask(db, orgId, pA.id, "in_progress", 2);
      const now = Date.now();
      for (const i of [0, 1, 2, 3]) {
        await seedDoc(db, orgId, pA.id, `d${i}`, new Date(now - i * DAY).toISOString());
      }
      for (let i = 0; i < 4; i += 1) {
        await seedRun(db, orgId, pA.id, new Date(now - i * DAY).toISOString());
      }
      await seedRun(db, orgId, pA.id, new Date(now - 8 * DAY).toISOString());
      await seedRun(db, orgId, pA.id, new Date(now - 30 * DAY).toISOString());

      const data = await loadDashboard(db, orgId);
      expect(data.counters).toEqual({ projects: 2, openTasks: 2, docs: 4, runsLast7d: 4 });
    } finally { await db.close(); }
  });

  test("recentRuns capped at 5 newest-first", async () => {
    const { db, orgId } = await freshDb("recent-runs");
    try {
      const p = await createProject(db, { orgId, slug: "p", name: "P" });
      const now = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        ids.push(await seedRun(db, orgId, p.id, new Date(now - i * 1000).toISOString()));
      }
      const data = await loadDashboard(db, orgId);
      expect(data.recentRuns).toHaveLength(5);
      expect(data.recentRuns.map((r) => r.id)).toEqual(ids.slice(0, 5));
    } finally { await db.close(); }
  });

  test("recentDocs capped at 5 ordered by updated_at DESC", async () => {
    const { db, orgId } = await freshDb("recent-docs");
    try {
      const p = await createProject(db, { orgId, slug: "p", name: "P" });
      const now = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        ids.push(await seedDoc(db, orgId, p.id, `t${i}`, new Date(now - i * 1000).toISOString()));
      }
      const data = await loadDashboard(db, orgId);
      expect(data.recentDocs).toHaveLength(5);
      expect(data.recentDocs.map((d) => d.id)).toEqual(ids.slice(0, 5));
    } finally { await db.close(); }
  });

  test("topTasks excludes completed/cancelled, orders by priority DESC, capped 5", async () => {
    const { db, orgId } = await freshDb("top-tasks");
    try {
      const p = await createProject(db, { orgId, slug: "p", name: "P" });
      await seedTask(db, orgId, p.id, "completed", 99, "skip-completed");
      await seedTask(db, orgId, p.id, "cancelled", 88, "skip-cancelled");
      await seedTask(db, orgId, p.id, "pending", 5, "p5");
      await seedTask(db, orgId, p.id, "pending", 4, "p4");
      await seedTask(db, orgId, p.id, "in_progress", 3, "p3");
      await seedTask(db, orgId, p.id, "blocked", 2, "p2");
      await seedTask(db, orgId, p.id, "pending", 1, "p1");
      await seedTask(db, orgId, p.id, "pending", 0, "p0");

      const data = await loadDashboard(db, orgId);
      expect(data.topTasks).toHaveLength(5);
      expect(data.topTasks.map((t) => t.priority)).toEqual([5, 4, 3, 2, 1]);
      for (const t of data.topTasks) {
        expect(["completed", "cancelled"]).not.toContain(t.status);
      }
    } finally { await db.close(); }
  });

  test("projectId filter narrows results to that project", async () => {
    const { db, orgId } = await freshDb("project-filter");
    try {
      const pA = await createProject(db, { orgId, slug: "a", name: "A" });
      const pB = await createProject(db, { orgId, slug: "b", name: "B" });
      await seedTask(db, orgId, pA.id, "pending", 5, "A-task");
      await seedTask(db, orgId, pB.id, "pending", 9, "B-task");
      await seedDoc(db, orgId, pA.id, "Adoc", new Date().toISOString());
      await seedDoc(db, orgId, pB.id, "Bdoc", new Date().toISOString());
      await seedRun(db, orgId, pA.id, new Date().toISOString(), "agentA");
      await seedRun(db, orgId, pB.id, new Date().toISOString(), "agentB");

      const data = await loadDashboard(db, orgId, pA.id);
      expect(data.counters.openTasks).toBe(1);
      expect(data.counters.docs).toBe(1);
      expect(data.counters.runsLast7d).toBe(1);
      expect(data.topTasks.map((t) => t.title)).toEqual(["A-task"]);
      expect(data.recentDocs.map((d) => d.title)).toEqual(["Adoc"]);
      expect(data.recentRuns.map((r) => r.agent)).toEqual(["agentA"]);
    } finally { await db.close(); }
  });

  test("projectTiles returns project name, open task count, and last activity", async () => {
    const { db, orgId } = await freshDb("project-tiles");
    try {
      const pA = await createProject(db, { orgId, slug: "alpha", name: "Alpha" });
      const pB = await createProject(db, { orgId, slug: "beta", name: "Beta" });
      await seedTask(db, orgId, pA.id, "pending", 1, "t1");
      await seedTask(db, orgId, pA.id, "in_progress", 2, "t2");
      await seedTask(db, orgId, pA.id, "completed", 3, "t3"); // should not count
      await seedTask(db, orgId, pB.id, "pending", 1, "t4");

      const data = await loadDashboard(db, orgId);
      expect(data.projectTiles).toBeDefined();
      expect(data.projectTiles).toHaveLength(2);

      const alpha = data.projectTiles.find((t: any) => t.name === "Alpha");
      expect(alpha).toBeDefined();
      expect(alpha!.openTasks).toBe(2);
      expect(alpha!.id).toBe(pA.id);

      const beta = data.projectTiles.find((t: any) => t.name === "Beta");
      expect(beta).toBeDefined();
      expect(beta!.openTasks).toBe(1);
    } finally { await db.close(); }
  });

  test("unreadCount returns count of events in the last 24h", async () => {
    const { db, orgId } = await freshDb("unread-count");
    try {
      await createProject(db, { orgId, slug: "p", name: "P" });
      // Seed 3 recent events
      for (let i = 0; i < 3; i++) {
        await db.query(
          `INSERT INTO events (id, org_id, actor, subject_kind, subject_id, verb)
             VALUES ($1, $2, $3, $4, $5, $6)`,
          [makeId(), orgId, "system", "task", makeId(), "created"],
        );
      }
      // Seed 1 old event (>24h ago)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await db.query(
        `INSERT INTO events (id, org_id, actor, subject_kind, subject_id, verb, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [makeId(), orgId, "system", "task", makeId(), "created", twoDaysAgo],
      );

      const data = await loadDashboard(db, orgId);
      // 3 seeded + 1 from createProject in freshDb = 4 recent events
      expect(data.unreadCount).toBe(4);
    } finally { await db.close(); }
  });

  test("projectId === null scopes to project_id IS NULL", async () => {
    const { db, orgId } = await freshDb("project-null");
    try {
      const p = await createProject(db, { orgId, slug: "p", name: "P" });
      await seedTask(db, orgId, null, "pending", 7, "null-task");
      await seedTask(db, orgId, p.id, "pending", 9, "scoped-task");
      await seedDoc(db, orgId, null, "null-doc", new Date().toISOString());
      await seedDoc(db, orgId, p.id, "scoped-doc", new Date().toISOString());
      await seedRun(db, orgId, null, new Date().toISOString(), "null-agent");
      await seedRun(db, orgId, p.id, new Date().toISOString(), "scoped-agent");

      const data = await loadDashboard(db, orgId, null);
      expect(data.counters.openTasks).toBe(1);
      expect(data.counters.docs).toBe(1);
      expect(data.counters.runsLast7d).toBe(1);
      expect(data.topTasks.map((t) => t.title)).toEqual(["null-task"]);
      expect(data.recentDocs.map((d) => d.title)).toEqual(["null-doc"]);
      expect(data.recentRuns.map((r) => r.agent)).toEqual(["null-agent"]);
    } finally { await db.close(); }
  });
});
