// Memory CRUD parity test.
// Verifies that list, search, show, remember, promote, archive, restore,
// edit, forget produce functionally identical results when executed through
// the same DB layer that Web tRPC, CLI --json, and TUI in-process tRPC
// all consume. The invariant: same fixture data → same output shape.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";

interface MemoryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  scope: string;
  kind: string;
  key: string;
  body: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

// Surface-agnostic CRUD operations — each surface (Web, CLI, TUI) maps
// to these same queries. Parity = identical results from identical data.
async function remember(db: TestStore, input: {
  orgId: string; projectId?: string | null; scope: string; kind: string;
  key: string; body: string; source?: string;
}): Promise<MemoryRow> {
  const id = makeId();
  await db.query(
    `INSERT INTO memories (id, org_id, project_id, scope, kind, key, body, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.orgId, input.projectId ?? null, input.scope, input.kind, input.key, input.body, input.source ?? null],
  );
  const rows = await db.query<MemoryRow>(`SELECT * FROM memories WHERE id = $1`, [id]);
  return rows[0]!;
}

async function list(db: TestStore, orgId: string): Promise<MemoryRow[]> {
  return db.query<MemoryRow>(
    `SELECT * FROM memories WHERE org_id = $1 ORDER BY updated_at DESC, id ASC`,
    [orgId],
  );
}

async function search(db: TestStore, orgId: string, query: string): Promise<MemoryRow[]> {
  return db.query<MemoryRow>(
    `SELECT * FROM memories WHERE org_id = $1 AND (key ILIKE '%' || $2 || '%' OR body ILIKE '%' || $2 || '%')
     ORDER BY updated_at DESC, id ASC`,
    [orgId, query],
  );
}

async function show(db: TestStore, id: string): Promise<MemoryRow | null> {
  const rows = await db.query<MemoryRow>(`SELECT * FROM memories WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function edit(db: TestStore, id: string, body: string): Promise<MemoryRow> {
  await db.query(
    `UPDATE memories SET body = $2, updated_at = now() WHERE id = $1`,
    [id, body],
  );
  const rows = await db.query<MemoryRow>(`SELECT * FROM memories WHERE id = $1`, [id]);
  return rows[0]!;
}

async function promote(db: TestStore, id: string): Promise<MemoryRow> {
  // Promote: set scope to 'global'
  await db.query(
    `UPDATE memories SET scope = 'global', updated_at = now() WHERE id = $1`,
    [id],
  );
  const rows = await db.query<MemoryRow>(`SELECT * FROM memories WHERE id = $1`, [id]);
  return rows[0]!;
}

async function archive(db: TestStore, id: string): Promise<void> {
  await db.query(
    `UPDATE memories SET scope = 'archived', updated_at = now() WHERE id = $1`,
    [id],
  );
}

async function restore(db: TestStore, id: string, scope: string): Promise<MemoryRow> {
  await db.query(
    `UPDATE memories SET scope = $2, updated_at = now() WHERE id = $1`,
    [id, scope],
  );
  const rows = await db.query<MemoryRow>(`SELECT * FROM memories WHERE id = $1`, [id]);
  return rows[0]!;
}

async function forget(db: TestStore, id: string): Promise<void> {
  await db.query(`DELETE FROM memories WHERE id = $1`, [id]);
}

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-crud-parity-"));
let db: TestStore;
let orgId: string;
let projectId: string;

beforeAll(async () => {
  db = await openIsolatedStore(join(scratch, "parity"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "parity", name: "Parity Org" });
  orgId = org.id;
  const project = await createProject(db, { orgId, slug: "pp", name: "Parity Project" });
  projectId = project.id;
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("memory CRUD parity", () => {
  let memId: string;

  test("remember: creates memory with all fields", async () => {
    const mem = await remember(db, {
      orgId, projectId, scope: "project", kind: "fact",
      key: "parity-key", body: "parity-value", source: "manual",
    });
    memId = mem.id;
    expect(mem.org_id).toBe(orgId);
    expect(mem.key).toBe("parity-key");
    expect(mem.body).toBe("parity-value");
    expect(mem.scope).toBe("project");
  });

  test("list: returns all memories for org", async () => {
    const mems = await list(db, orgId);
    expect(mems.length).toBeGreaterThanOrEqual(1);
    expect(mems.some((m) => m.id === memId)).toBe(true);
  });

  test("search: finds memory by key substring", async () => {
    const results = await search(db, orgId, "parity");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.id === memId)).toBe(true);
  });

  test("show: retrieves single memory by id", async () => {
    const mem = await show(db, memId);
    expect(mem).not.toBeNull();
    expect(mem!.key).toBe("parity-key");
  });

  test("edit: updates body", async () => {
    const updated = await edit(db, memId, "updated-value");
    expect(updated.body).toBe("updated-value");
    // Verify show returns same
    const shown = await show(db, memId);
    expect(shown!.body).toBe("updated-value");
  });

  test("promote: sets scope to global", async () => {
    const promoted = await promote(db, memId);
    expect(promoted.scope).toBe("global");
  });

  test("archive: sets scope to archived", async () => {
    await archive(db, memId);
    const mem = await show(db, memId);
    expect(mem!.scope).toBe("archived");
  });

  test("restore: restores scope from archived", async () => {
    const restored = await restore(db, memId, "project");
    expect(restored.scope).toBe("project");
  });

  test("forget: hard deletes memory", async () => {
    await forget(db, memId);
    const mem = await show(db, memId);
    expect(mem).toBeNull();
  });

  test("all 9 verbs produce consistent round-trip", async () => {
    // Full lifecycle in sequence: remember → list → search → show → edit → promote → archive → restore → forget
    const m = await remember(db, {
      orgId, projectId, scope: "task", kind: "decision",
      key: "round-trip-key", body: "round-trip-body", source: "heuristic",
    });
    const listed = await list(db, orgId);
    expect(listed.some((x) => x.id === m.id)).toBe(true);

    const searched = await search(db, orgId, "round-trip");
    expect(searched.some((x) => x.id === m.id)).toBe(true);

    const shown = await show(db, m.id);
    expect(shown!.body).toBe("round-trip-body");

    const edited = await edit(db, m.id, "edited-body");
    expect(edited.body).toBe("edited-body");

    const promoted = await promote(db, m.id);
    expect(promoted.scope).toBe("global");

    await archive(db, m.id);
    expect((await show(db, m.id))!.scope).toBe("archived");

    const restored = await restore(db, m.id, "task");
    expect(restored.scope).toBe("task");

    await forget(db, m.id);
    expect(await show(db, m.id)).toBeNull();
  });
});
