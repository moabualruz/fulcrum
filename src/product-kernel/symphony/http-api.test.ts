import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../db/pglite.ts";
import { runMigrations } from "../db/migrate.ts";
import { createLocalOrg, createProject, createTask } from "../store/repositories.ts";
import { createHttpApiRoutes, getIssueDetail, getSystemState } from "./http-api.ts";
import { isFeatureEnabled, parseFeatureFlags } from "../features.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-httpapi-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("HTTP API routes (flag gating)", () => {
  test("flag off → routes should not be mounted (caller responsibility)", () => {
    const flags = parseFeatureFlags("");
    expect(isFeatureEnabled("symphony-http-api", flags)).toBe(false);
  });

  test("flag on → routes available", () => {
    const flags = parseFeatureFlags("symphony-http-api");
    expect(isFeatureEnabled("symphony-http-api", flags)).toBe(true);
  });
});

describe("GET /api/v1/state", () => {
  test("returns empty state with zero counts", async () => {
    const db = await freshDb("state-empty");
    try {
      const state = await getSystemState(db);
      expect(state.counts.running).toBe(0);
      expect(state.counts.retrying).toBe(0);
      expect(state.running).toHaveLength(0);
      expect(state.retrying).toHaveLength(0);
      expect(state.generated_at).toBeTruthy();
    } finally {
      await db.close();
    }
  });

  test("returns running sessions", async () => {
    const db = await freshDb("state-running");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const proj = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
      const task = await createTask(db, { orgId: org.id, projectId: proj.id, title: "MT-100" });
      // Insert a running agent_run
      await db.query(
        `INSERT INTO agent_runs (id, org_id, project_id, task_id, agent, status, started_at)
         VALUES ('run-1', $1, $2, $3, 'codex', 'running', now())`,
        [org.id, proj.id, task.id],
      );
      const state = await getSystemState(db);
      expect(state.counts.running).toBe(1);
      expect(state.running[0]?.issue_id).toBe(task.id);
      expect(state.running[0]?.state).toBe("running");
    } finally {
      await db.close();
    }
  });
});

describe("GET /api/v1/:identifier", () => {
  test("returns null for unknown identifier", async () => {
    const db = await freshDb("issue-unknown");
    try {
      const detail = await getIssueDetail(db, "nonexistent");
      expect(detail).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("returns detail for known task by id", async () => {
    const db = await freshDb("issue-byid");
    try {
      const org = await createLocalOrg(db, { slug: "default", name: "Default" });
      const proj = await createProject(db, { orgId: org.id, slug: "p1", name: "P1" });
      const task = await createTask(db, { orgId: org.id, projectId: proj.id, title: "MT-200" });
      const detail = await getIssueDetail(db, task.id);
      expect(detail).not.toBeNull();
      expect(detail!.issue_id).toBe(task.id);
      expect(detail!.issue_identifier).toBe("MT-200");
    } finally {
      await db.close();
    }
  });
});

describe("route handlers", () => {
  test("getState route returns 200", async () => {
    const db = await freshDb("routes-state");
    try {
      const routes = createHttpApiRoutes(db);
      const result = await routes.getState();
      expect(result.status).toBe(200);
      expect(result.body.counts).toBeDefined();
    } finally {
      await db.close();
    }
  });

  test("getIssue route returns 404 for unknown", async () => {
    const db = await freshDb("routes-404");
    try {
      const routes = createHttpApiRoutes(db);
      const result = await routes.getIssue("nope");
      expect(result.status).toBe(404);
      expect("error" in result.body).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("postRefresh calls onRefresh callback and returns 200", async () => {
    const db = await freshDb("routes-refresh");
    try {
      let refreshed = false;
      const routes = createHttpApiRoutes(db, () => { refreshed = true; });
      const result = await routes.postRefresh();
      expect(result.status).toBe(200);
      expect(refreshed).toBe(true);
      expect((result.body as { queued: boolean }).queued).toBe(true);
    } finally {
      await db.close();
    }
  });
});
