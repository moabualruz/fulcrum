import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import {
  createLocalOrg,
  createProject,
} from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import {
  loadOrchestrationDashboard,
  loadProjectRuns,
  loadOrchestrationConfig,
  upsertOrchestrationConfig,
  loadWorkflowDef,
  listWorkflowDefs,
  upsertWorkflowDef,
  SYMPHONY_COLORS,
} from "./orchestration.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-orch-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{
  db: TestStore;
  orgId: string;
  projectId: string;
}> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(
  db: TestStore,
  orgId: string,
  projectId: string | null,
  status: string,
  overrides: Partial<{
    agent: string;
    symphony_state: string;
    last_error_kind: string;
    retry_count: number;
  }> = {},
): Promise<string> {
  const id = makeId();
  await db.query(
    `INSERT INTO agent_runs
      (id, org_id, project_id, agent, model, prompt, status, symphony_state, last_error_kind, retry_count)
     VALUES ($1, $2, $3, $4, 'gpt-5', 'do thing', $5, $6, $7, $8)`,
    [
      id,
      orgId,
      projectId,
      overrides.agent ?? "codex",
      status,
      overrides.symphony_state ?? null,
      overrides.last_error_kind ?? null,
      overrides.retry_count ?? 0,
    ],
  );
  return id;
}

describe("SYMPHONY_COLORS", () => {
  test("has color for every state", () => {
    const states = ["pending", "dispatched", "running", "stalled", "succeeded", "failed", "cancelled"] as const;
    for (const s of states) {
      expect(SYMPHONY_COLORS[s]).toBeDefined();
      expect(typeof SYMPHONY_COLORS[s]).toBe("string");
    }
  });
});

describe("loadOrchestrationDashboard", () => {
  test("returns status + dispatches + retryQueue for empty DB", async () => {
    const { db, orgId } = await freshDb("dash-empty");
    try {
      const data = await loadOrchestrationDashboard(db, orgId);
      expect(data.status.concurrencyUsed).toBe(0);
      expect(data.status.concurrencyMax).toBe(4);
      expect(data.status.workerConnected).toBe(false);
      expect(data.dispatches).toEqual([]);
      expect(data.retryQueue).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("returns dispatches and retry queue with seeded data", async () => {
    const { db, orgId, projectId } = await freshDb("dash-seeded");
    try {
      await seedRun(db, orgId, projectId, "running", { symphony_state: "running" });
      await seedRun(db, orgId, projectId, "failed", { last_error_kind: "timeout", retry_count: 2 });
      await seedRun(db, orgId, projectId, "succeeded");

      const data = await loadOrchestrationDashboard(db, orgId);
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

  test("concurrencyMax reflects config", async () => {
    const { db, orgId } = await freshDb("dash-config");
    try {
      await upsertOrchestrationConfig(db, orgId, {
        pollIntervalS: 10,
        maxConcurrency: 8,
        stallTimeoutS: 600,
        workspaceRoot: "/tmp/ws",
      });
      const data = await loadOrchestrationDashboard(db, orgId);
      expect(data.status.concurrencyMax).toBe(8);
    } finally {
      await db.close();
    }
  });
});

describe("loadProjectRuns", () => {
  test("returns runs scoped to project", async () => {
    const { db, orgId, projectId } = await freshDb("proj-runs");
    try {
      await seedRun(db, orgId, projectId, "running", { symphony_state: "dispatched" });
      await seedRun(db, orgId, null, "succeeded"); // different project scope
      const runs = await loadProjectRuns(db, orgId, projectId);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.symphony_state).toBe("dispatched");
    } finally {
      await db.close();
    }
  });
});

describe("orchestration config CRUD", () => {
  test("load returns null when no config exists", async () => {
    const { db, orgId } = await freshDb("config-empty");
    try {
      const config = await loadOrchestrationConfig(db, orgId);
      expect(config).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("upsert creates and then updates config", async () => {
    const { db, orgId } = await freshDb("config-upsert");
    try {
      const created = await upsertOrchestrationConfig(db, orgId, {
        pollIntervalS: 5,
        maxConcurrency: 4,
        stallTimeoutS: 300,
        workspaceRoot: null,
      });
      expect(created.poll_interval_s).toBe(5);
      expect(created.max_concurrency).toBe(4);

      const updated = await upsertOrchestrationConfig(db, orgId, {
        pollIntervalS: 10,
        maxConcurrency: 8,
        stallTimeoutS: 600,
        workspaceRoot: "/workspace",
      });
      expect(updated.poll_interval_s).toBe(10);
      expect(updated.max_concurrency).toBe(8);
      expect(updated.workspace_root).toBe("/workspace");

      const loaded = await loadOrchestrationConfig(db, orgId);
      expect(loaded?.poll_interval_s).toBe(10);
    } finally {
      await db.close();
    }
  });
});

describe("workflow defs CRUD", () => {
  test("upsert creates workflow def", async () => {
    const { db, orgId, projectId } = await freshDb("wf-create");
    try {
      const def = await upsertWorkflowDef(db, orgId, {
        projectId,
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

  test("upsert updates existing workflow def", async () => {
    const { db, orgId } = await freshDb("wf-update");
    try {
      const created = await upsertWorkflowDef(db, orgId, {
        name: "WF1",
        yamlConfig: "v1",
        promptTemplate: "p1",
      });
      const updated = await upsertWorkflowDef(db, orgId, {
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

  test("listWorkflowDefs returns all defs for org", async () => {
    const { db, orgId } = await freshDb("wf-list");
    try {
      await upsertWorkflowDef(db, orgId, { name: "A", yamlConfig: "", promptTemplate: "" });
      await upsertWorkflowDef(db, orgId, { name: "B", yamlConfig: "", promptTemplate: "" });
      const defs = await listWorkflowDefs(db, orgId);
      expect(defs).toHaveLength(2);
    } finally {
      await db.close();
    }
  });

  test("loadWorkflowDef returns single def", async () => {
    const { db, orgId } = await freshDb("wf-load");
    try {
      const created = await upsertWorkflowDef(db, orgId, {
        name: "Specific",
        yamlConfig: "yaml",
        promptTemplate: "prompt",
      });
      const loaded = await loadWorkflowDef(db, orgId, created.id);
      expect(loaded?.name).toBe("Specific");
      expect(loaded?.yaml_config).toBe("yaml");
    } finally {
      await db.close();
    }
  });

  test("loadWorkflowDef returns null for missing", async () => {
    const { db, orgId } = await freshDb("wf-missing");
    try {
      const loaded = await loadWorkflowDef(db, orgId, "nonexistent");
      expect(loaded).toBeNull();
    } finally {
      await db.close();
    }
  });
});
