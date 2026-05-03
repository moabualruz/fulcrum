import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, createProject, appendEvent } from "../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { queryAuditEvents, eventsToCsv, eventsToJson } from "../../lib/server/audit.ts";

let scratch: string;
let db: ProductDb;
let orgId: string;
let projectId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-audit-"));
  const dbDir = join(scratch, "db");
  mkdirSync(dbDir, { recursive: true });
  db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
  const proj = await createProject(db, { orgId, slug: "alpha", name: "Alpha" });
  projectId = proj.id;
  // Seed audit events
  await appendEvent(db, { orgId, projectId, actor: "alice", subjectKind: "task", subjectId: "t1", verb: "created", payload: { title: "Task 1" } });
  await appendEvent(db, { orgId, projectId, actor: "bob", subjectKind: "doc", subjectId: "d1", verb: "updated" });
  await appendEvent(db, { orgId, actor: "alice", subjectKind: "task", subjectId: "t2", verb: "assigned" });
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("/audit page.server load() via queryAuditEvents", () => {
  test("returns all events unfiltered", async () => {
    const result = await queryAuditEvents(db, { orgId });
    // 3 seeded + 1 from createProject = 4
    expect(result.total).toBeGreaterThanOrEqual(4);
    expect(result.rows.length).toBeGreaterThanOrEqual(4);
  });

  test("kind filter narrows to matching subject_kind", async () => {
    const result = await queryAuditEvents(db, { orgId, subjectKind: "task" });
    expect(result.rows.every((r) => r.subject_kind === "task")).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  test("verb filter narrows to matching verb", async () => {
    const result = await queryAuditEvents(db, { orgId, verb: "assigned" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.verb).toBe("assigned");
  });

  test("date range filter excludes events outside range", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = await queryAuditEvents(db, { orgId, since: futureDate });
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  test("returns empty when no events match filter", async () => {
    const result = await queryAuditEvents(db, { orgId, subjectKind: "nonexistent" });
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  test("pagination works with limit/offset", async () => {
    const page1 = await queryAuditEvents(db, { orgId }, { limit: 2, offset: 0 });
    expect(page1.rows).toHaveLength(2);
    const page2 = await queryAuditEvents(db, { orgId }, { limit: 2, offset: 2 });
    expect(page2.rows).toHaveLength(2);
    // No overlap
    const ids1 = new Set(page1.rows.map((r) => r.id));
    expect(page2.rows.some((r) => ids1.has(r.id))).toBe(false);
  });

  test("projectId filter scopes to project", async () => {
    const result = await queryAuditEvents(db, { orgId, projectId });
    expect(result.rows.every((r) => r.project_id === projectId)).toBe(true);
  });
});

describe("CSV export", () => {
  test("headers match event columns", () => {
    const csv = eventsToCsv([]);
    expect(csv.split("\n")[0]).toBe("id,org_id,project_id,actor,subject_kind,subject_id,verb,payload,created_at");
  });

  test("rows contain event data", async () => {
    const result = await queryAuditEvents(db, { orgId, verb: "assigned" });
    const csv = eventsToCsv(result.rows);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("assigned");
    expect(lines[1]).toContain("alice");
  });
});

describe("JSON export", () => {
  test("produces valid JSON array", async () => {
    const result = await queryAuditEvents(db, { orgId });
    const json = eventsToJson(result.rows);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(result.rows.length);
  });
});
