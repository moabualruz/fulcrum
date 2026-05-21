import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  createLocalOrg,
  makeId,
  migrateIsolatedStore,
  openIsolatedStore,
  type TestStore,
} from "@test-support/product-workspace-fixtures.ts";
import {
  loadOrchestrationDashboard,
  loadOrchestrationConfig,
  upsertOrchestrationConfig,
  loadWorkflowDef,
  listWorkflowDefs,
  upsertWorkflowDef,
  SYMPHONY_COLORS,
} from "./orchestration.ts";

// `$lib/server/orchestration` re-exports the execution-orchestration service
// surface. That surface takes `(em, ctx)` — `ctx` is an
// `OrchestrationApplicationContext` ({ orgId, userId, projectId? }), not a raw
// org-id string — and reads the `agent_runs` / `orchestration_config` /
// `workflow_defs` tables from the isolated product store. The previous test
// called it with the legacy `(db, orgId)` shape and imported a `loadProjectRuns`
// helper that the module never exported; project-scoped run listing is now
// owned by `@execution-orchestration/interface/run-pages.ts` (`listProjectRuns`).

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-orch-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: TestStore; ctx: { orgId: string; userId: null } }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  return { db, ctx: { orgId: org.id, userId: null } };
}

async function seedRun(
  db: TestStore,
  orgId: string,
  status: string,
  overrides: Partial<{ symphony_state: string; last_error_kind: string; retry_count: number }> = {},
): Promise<void> {
  await db.query(
    `INSERT INTO agent_runs
       (id, org_id, project_id, agent, agent_name, model, prompt, status,
        symphony_state, last_error_kind, attempt_count, retry_count)
     VALUES ($1, $2, NULL, 'codex', 'codex', 'gpt-5', 'do thing', $3, $4, $5, $6, $6)`,
    [
      makeId(),
      orgId,
      status,
      overrides.symphony_state ?? null,
      overrides.last_error_kind ?? null,
      overrides.retry_count ?? 0,
    ],
  );
}

describe("SYMPHONY_COLORS", () => {
  test("has a color for every orchestration state", () => {
    const states = ["pending", "dispatched", "running", "stalled", "succeeded", "failed", "cancelled"] as const;
    for (const state of states) {
      expect(typeof SYMPHONY_COLORS[state]).toBe("string");
    }
  });
});

describe("loadOrchestrationDashboard", () => {
  test("returns status + dispatches + retryQueue for an empty store", async () => {
    const { db, ctx } = await freshDb("dash-empty");
    try {
      const data = await loadOrchestrationDashboard(db as never, ctx);
      expect(data.status.concurrencyUsed).toBe(0);
      expect(data.status.workerConnected).toBe(false);
      expect(data.dispatches).toEqual([]);
      expect(data.retryQueue).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("returns dispatches and retry queue with seeded runs", async () => {
    const { db, ctx } = await freshDb("dash-seeded");
    try {
      await seedRun(db, ctx.orgId, "running", { symphony_state: "running" });
      await seedRun(db, ctx.orgId, "failed", { last_error_kind: "timeout", retry_count: 2 });
      await seedRun(db, ctx.orgId, "succeeded");

      const data = await loadOrchestrationDashboard(db as never, ctx);
      expect(data.status.concurrencyUsed).toBe(1);
      expect(data.status.workerConnected).toBe(true);
      expect(data.dispatches.length).toBeGreaterThanOrEqual(3);
      expect(data.retryQueue).toHaveLength(1);
      expect(data.retryQueue[0]?.last_error_kind).toBe("timeout");
      expect(data.retryQueue[0]?.retry_count).toBe(2);
    } finally {
      await db.close();
    }
  });

  test("concurrencyMax reflects the persisted orchestration config", async () => {
    const { db, ctx } = await freshDb("dash-config");
    try {
      await upsertOrchestrationConfig(db as never, ctx, {
        pollIntervalS: 10,
        maxConcurrency: 8,
        stallTimeoutS: 600,
        workspaceRoot: "/tmp/ws",
      });
      const data = await loadOrchestrationDashboard(db as never, ctx);
      expect(data.status.concurrencyMax).toBe(8);
    } finally {
      await db.close();
    }
  });
});

describe("orchestration config CRUD", () => {
  test("load returns null when no config exists", async () => {
    const { db, ctx } = await freshDb("config-empty");
    try {
      expect(await loadOrchestrationConfig(db as never, ctx)).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("upsert creates and then updates config", async () => {
    const { db, ctx } = await freshDb("config-upsert");
    try {
      const created = await upsertOrchestrationConfig(db as never, ctx, {
        pollIntervalS: 5,
        maxConcurrency: 4,
        stallTimeoutS: 300,
        workspaceRoot: null,
      });
      expect(created.poll_interval_s).toBe(5);
      expect(created.max_concurrency).toBe(4);

      const updated = await upsertOrchestrationConfig(db as never, ctx, {
        pollIntervalS: 10,
        maxConcurrency: 8,
        stallTimeoutS: 600,
        workspaceRoot: "/workspace",
      });
      expect(updated.poll_interval_s).toBe(10);
      expect(updated.max_concurrency).toBe(8);
      expect(updated.workspace_root).toBe("/workspace");

      const loaded = await loadOrchestrationConfig(db as never, ctx);
      expect(loaded?.poll_interval_s).toBe(10);
    } finally {
      await db.close();
    }
  });
});

describe("workflow defs CRUD", () => {
  test("upsert creates a workflow def", async () => {
    const { db, ctx } = await freshDb("wf-create");
    try {
      const def = await upsertWorkflowDef(db as never, ctx, {
        name: "Test Workflow",
        description: "A test",
        yamlConfig: "steps:\n  - run: test",
        promptTemplate: "Do {{ task }}",
      });
      expect(def.name).toBe("Test Workflow");
      expect(def.yaml_config).toBe("steps:\n  - run: test");
      expect(def.prompt_template).toBe("Do {{ task }}");
    } finally {
      await db.close();
    }
  });

  test("upsert updates an existing workflow def", async () => {
    const { db, ctx } = await freshDb("wf-update");
    try {
      const created = await upsertWorkflowDef(db as never, ctx, {
        name: "WF1",
        yamlConfig: "v1",
        promptTemplate: "p1",
      });
      const updated = await upsertWorkflowDef(db as never, ctx, {
        id: created.id,
        name: "WF1 Updated",
        yamlConfig: "v2",
        promptTemplate: "p2",
      });
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe("WF1 Updated");
      expect(updated.yaml_config).toBe("v2");
    } finally {
      await db.close();
    }
  });

  test("listWorkflowDefs returns all defs for the org", async () => {
    const { db, ctx } = await freshDb("wf-list");
    try {
      await upsertWorkflowDef(db as never, ctx, { name: "A", yamlConfig: "", promptTemplate: "" });
      await upsertWorkflowDef(db as never, ctx, { name: "B", yamlConfig: "", promptTemplate: "" });
      const defs = await listWorkflowDefs(db as never, ctx);
      expect(defs).toHaveLength(2);
    } finally {
      await db.close();
    }
  });

  test("loadWorkflowDef returns a single def", async () => {
    const { db, ctx } = await freshDb("wf-load");
    try {
      const created = await upsertWorkflowDef(db as never, ctx, {
        name: "Specific",
        yamlConfig: "yaml",
        promptTemplate: "prompt",
      });
      const loaded = await loadWorkflowDef(db as never, ctx, created.id);
      expect(loaded?.name).toBe("Specific");
      expect(loaded?.yaml_config).toBe("yaml");
    } finally {
      await db.close();
    }
  });

  test("loadWorkflowDef returns null for a missing id", async () => {
    const { db, ctx } = await freshDb("wf-missing");
    try {
      expect(await loadWorkflowDef(db as never, ctx, makeId())).toBeNull();
    } finally {
      await db.close();
    }
  });
});
