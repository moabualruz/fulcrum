import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestOrm, type TestOrm } from "@/test-utils/db.ts";
import {
  queryAuditEvents,
  eventsToCsv,
  eventsToJson,
  getRetentionPolicy,
  upsertRetentionPolicy,
} from "./audit.ts";

let scratch: string;
let db: TestOrm;
let orgId: string;
let projectId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-audit-test-"));
  db = await createTestOrm();
  orgId = db.seed.orgId;
  projectId = randomUUID();
  await db.pglite.query(
    `INSERT INTO projects (id, org_id, name) VALUES ($1, $2, 'Alpha')`,
    [projectId, orgId],
  );
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function appendTestEvent(input: {
  orgId: string;
  projectId?: string | null;
  actor: string;
  subjectKind: string;
  subjectId: string;
  verb: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.pglite.query(
    `INSERT INTO audit_events (id, org_id, project_id, actor_id, subject_kind, subject_id, action, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      input.orgId,
      input.projectId ?? "",
      input.actor,
      input.subjectKind,
      input.subjectId,
      input.verb,
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

describe("queryAuditEvents", () => {
  test("returns events for org ordered by created_at DESC", async () => {
    await appendTestEvent({ orgId, actor: "alice", subjectKind: "task", subjectId: "t1", verb: "created" });
    await appendTestEvent({ orgId, actor: "bob", subjectKind: "doc", subjectId: "d1", verb: "updated" });
    const result = await queryAuditEvents(db.em.fork(), { orgId });
    expect(result.total).toBe(2);
    // DESC order: latest first
    const dates = result.rows.map((r) => r.created_at);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]! >= dates[i]!).toBe(true);
    }
  });

  test("filters by subject_kind", async () => {
    await appendTestEvent({ orgId, actor: "alice", subjectKind: "task", subjectId: "t1", verb: "created" });
    await appendTestEvent({ orgId, actor: "bob", subjectKind: "doc", subjectId: "d1", verb: "updated" });
    const result = await queryAuditEvents(db.em.fork(), { orgId, subjectKind: "task" });
    expect(result.rows.every((r) => r.subject_kind === "task")).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  test("filters by verb", async () => {
    await appendTestEvent({ orgId, actor: "alice", subjectKind: "task", subjectId: "t1", verb: "assigned" });
    const result = await queryAuditEvents(db.em.fork(), { orgId, verb: "assigned" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.verb).toBe("assigned");
  });

  test("filters by date range (since/until)", async () => {
    // All events are created "now", so filtering with a future 'since' should exclude them
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = await queryAuditEvents(db.em.fork(), { orgId, since: futureDate });
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  test("pagination with limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await appendTestEvent({ orgId, actor: "a", subjectKind: "task", subjectId: `t${i}`, verb: "created" });
    }
    const page1 = await queryAuditEvents(db.em.fork(), { orgId }, { limit: 2, offset: 0 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await queryAuditEvents(db.em.fork(), { orgId }, { limit: 2, offset: 2 });
    expect(page2.rows).toHaveLength(2);
    // No overlap
    const ids1 = page1.rows.map((r) => r.id);
    const ids2 = page2.rows.map((r) => r.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  test("filters by projectId", async () => {
    await appendTestEvent({ orgId, projectId, actor: "alice", subjectKind: "task", subjectId: "t1", verb: "created" });
    await appendTestEvent({ orgId, actor: "bob", subjectKind: "doc", subjectId: "d1", verb: "created" }); // no project
    const result = await queryAuditEvents(db.em.fork(), { orgId, projectId });
    expect(result.rows.every((r) => r.project_id === projectId)).toBe(true);
  });
});

describe("eventsToCsv", () => {
  test("CSV headers match event columns", () => {
    const csv = eventsToCsv([]);
    const headers = csv.split("\n")[0]!;
    expect(headers).toBe("id,org_id,project_id,actor,subject_kind,subject_id,verb,payload,created_at");
  });

  test("CSV rows contain event data", () => {
    const csv = eventsToCsv([
      { id: "e1", org_id: "o1", project_id: null, actor: "alice", subject_kind: "task", subject_id: "t1", verb: "created", payload: {}, created_at: "2026-05-01T00:00:00Z" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("e1");
    expect(lines[1]).toContain("alice");
    expect(lines[1]).toContain("task");
  });
});

describe("eventsToJson", () => {
  test("produces valid JSON array", () => {
    const events = [
      { id: "e1", org_id: "o1", project_id: null, actor: "alice", subject_kind: "task", subject_id: "t1", verb: "created", payload: { foo: 1 }, created_at: "2026-05-01T00:00:00Z" },
    ];
    const json = eventsToJson(events);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("e1");
  });
});

describe("retention policy", () => {
  test("getRetentionPolicy returns null when none set", async () => {
    const result = await getRetentionPolicy(db.em.fork(), orgId);
    expect(result).toBeNull();
  });

  test("upsertRetentionPolicy creates and returns policy", async () => {
    const policy = await upsertRetentionPolicy(db.em.fork(), orgId, 30);
    expect(policy.retain_days).toBe(30);
    expect(policy.org_id).toBe(orgId);
    expect(policy.project_id).toBeNull();
  });

  test("upsertRetentionPolicy updates existing policy", async () => {
    await upsertRetentionPolicy(db.em.fork(), orgId, 30);
    const updated = await upsertRetentionPolicy(db.em.fork(), orgId, 90);
    expect(updated.retain_days).toBe(90);
  });

  test("retain_days=0 accepted (keep forever)", async () => {
    const policy = await upsertRetentionPolicy(db.em.fork(), orgId, 0);
    expect(policy.retain_days).toBe(0);
  });

  test("getRetentionPolicy retrieves after upsert", async () => {
    await upsertRetentionPolicy(db.em.fork(), orgId, 60);
    const result = await getRetentionPolicy(db.em.fork(), orgId);
    expect(result).not.toBeNull();
    expect(result!.retain_days).toBe(60);
  });
});
