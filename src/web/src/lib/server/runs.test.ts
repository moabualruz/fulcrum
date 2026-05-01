import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { cancelRunAction, retryRunAction } from "./runs.ts";

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
  db: ProductDb;
  orgId: string;
  projectId: string;
}> {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  return { db, orgId: org.id, projectId: project.id };
}

async function seedRun(
  db: ProductDb,
  orgId: string,
  projectId: string | null,
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  overrides: Partial<{ agent: string; model: string | null; prompt: string | null }> = {},
): Promise<string> {
  const id = newUlid();
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

async function readRun(db: ProductDb, id: string): Promise<AgentRunRow | undefined> {
  const rows = await db.query<AgentRunRow>(`SELECT * FROM agent_runs WHERE id = $1`, [id]);
  return rows[0];
}

async function readEventsForSubject(db: ProductDb, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("server actions: runs", () => {
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
