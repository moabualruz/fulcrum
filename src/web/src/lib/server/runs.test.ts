import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "../../../../test-support/product-fixtures.ts";
import { makeId } from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import { cancelRunAction, dispatchRunAction, retryRunAction } from "./runs.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-runs-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface AgentRunRow {
  id: string;
  org_id: string;
  project_id: string | null;
  agent: string;
  model: string | null;
  prompt: string | null;
  status: string;
  parent_run_id: string | null;
  started_at: string;
  ended_at: string | null;
}

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
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  overrides: Partial<{ agent: string; model: string | null; prompt: string | null }> = {},
): Promise<string> {
  const id = makeId();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, model, prompt, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      orgId,
      projectId,
      overrides.agent ?? "codex",
      overrides.model ?? "gpt-5",
      overrides.prompt ?? "Do the thing",
      status,
    ],
  );
  return id;
}

async function readRun(db: TestStore, id: string): Promise<AgentRunRow | undefined> {
  const rows = await db.query<AgentRunRow>(`SELECT * FROM agent_runs WHERE id = $1`, [id]);
  return rows[0];
}

async function readEventsForSubject(db: TestStore, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("server actions: runs", () => {
  test("dispatchRunAction creates queued run + agent job + event", async () => {
    const { db, orgId, projectId } = await freshDb("dispatch-ok");
    try {
      const taskId = makeId();
      await db.query(
        `INSERT INTO tasks (id, org_id, project_id, title, status)
         VALUES ($1, $2, $3, 'Ship artifacts', 'pending')`,
        [taskId, orgId, projectId],
      );

      const { id } = await dispatchRunAction(db, {
        orgId,
        projectId,
        taskId,
        agent: "codex",
      });

      const row = await readRun(db, id);
      expect(row?.status).toBe("queued");
      expect(row?.agent).toBe("codex");
      expect(row?.project_id).toBe(projectId);

      const jobs = await db.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM jobs WHERE queue = 'agent-runs'`,
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.payload).toEqual({ run_id: id });

      const events = await readEventsForSubject(db, id);
      expect(events.find((e) => e.verb === "dispatched")?.subject_kind).toBe("agent_run");
    } finally {
      await db.close();
    }
  });

  test("cancelRunAction sets status=cancelled + emits agent_run.cancelled", async () => {
    const { db, orgId, projectId } = await freshDb("cancel-ok");
    try {
      const id = await seedRun(db, orgId, projectId, "running");
      const result = await cancelRunAction(db, id, orgId);
      expect(result).toEqual({ ok: true });

      const row = await readRun(db, id);
      expect(row?.status).toBe("cancelled");
      expect(row?.ended_at).not.toBeNull();

      const events = await readEventsForSubject(db, id);
      const cancelled = events.find((e) => e.verb === "cancelled");
      expect(cancelled?.subject_kind).toBe("agent_run");
      expect(cancelled?.subject_id).toBe(id);
      expect(cancelled?.org_id).toBe(orgId);
    } finally {
      await db.close();
    }
  });

  test("cancelRunAction is idempotent: already cancelled emits no event", async () => {
    const { db, orgId, projectId } = await freshDb("cancel-idem");
    try {
      const id = await seedRun(db, orgId, projectId, "cancelled");
      const result = await cancelRunAction(db, id, orgId);
      expect(result).toEqual({ ok: true });

      const events = await readEventsForSubject(db, id);
      const cancelled = events.filter((e) => e.verb === "cancelled");
      expect(cancelled).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  test("retryRunAction creates new agent_runs row + jobs row + agent_run.retried event", async () => {
    const { db, orgId, projectId } = await freshDb("retry-ok");
    try {
      const parentId = await seedRun(db, orgId, projectId, "failed", {
        agent: "claude",
        model: "opus",
        prompt: "Original prompt",
      });

      const { id: newId } = await retryRunAction(db, parentId, orgId);
      expect(newId).not.toBe(parentId);

      const newRow = await readRun(db, newId);
      expect(newRow?.status).toBe("queued");
      expect(newRow?.agent).toBe("claude");
      expect(newRow?.model).toBe("opus");
      expect(newRow?.prompt).toBe("Original prompt");
      expect(newRow?.project_id).toBe(projectId);
      expect(newRow?.parent_run_id).toBe(parentId);
      expect(newRow?.org_id).toBe(orgId);

      const jobs = await db.query<{
        id: string;
        queue: string;
        kind: string;
        payload: Record<string, unknown>;
        status: string;
      }>(
        `SELECT id, queue, kind, payload, status FROM jobs WHERE queue = 'agent-runs'`,
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.kind).toBe("agent_run");
      expect(jobs[0]?.payload).toEqual({ run_id: newId });

      const events = await readEventsForSubject(db, parentId);
      const retried = events.find((e) => e.verb === "retried");
      expect(retried?.subject_kind).toBe("agent_run");
      expect(retried?.subject_id).toBe(parentId);
      expect(retried?.payload).toEqual({ parent: parentId, retry: newId });
    } finally {
      await db.close();
    }
  });

  test("retryRunAction throws when original run is missing", async () => {
    const { db } = await freshDb("retry-missing");
    try {
      expect(retryRunAction(db, "01J0NONEXISTENTULIDAAAAAAAA", "00000000000000000000000000")).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
