import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject, createTask } from "@test-support/product-workspace-fixtures.ts";
import { assembleContext } from "./context.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-assembler-replay-"));
let db: TestStore;
let orgId: string;
let taskId: string;

beforeAll(async () => {
  db = await openIsolatedStore(join(scratch, "replay"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "r", name: "Replay Org" });
  orgId = org.id;
  const project = await createProject(db, { orgId, slug: "rp", name: "Replay Project" });
  const task = await createTask(db, {
    orgId,
    projectId: project.id,
    title: "Replay task",
    description: "Verify assembler byte-stability",
  });
  taskId = task.id;

  // Seed linked docs and memories
  const docId = makeId();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [docId, orgId, project.id, "spec", "Replay spec", "spec content"],
  );
  await db.query(
    `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [makeId(), orgId, project.id, "task", taskId, "document", docId, "references"],
  );
  const memId = makeId();
  await db.query(
    `INSERT INTO memories (id, org_id, project_id, scope, kind, key, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [memId, orgId, project.id, "task", "fact", "replay-key", "replay-value"],
  );
  await db.query(
    `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [makeId(), orgId, project.id, "task", taskId, "memory", memId, "informs"],
  );
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("assembler replay", () => {
  test("re-hydrate produces byte-identical JSON", async () => {
    const first = await assembleContext(db, { orgId, taskId });
    // Serialize as JSON to simulate ContextSnapshot storage
    const snapshot = JSON.stringify(first);
    // Re-hydrate
    const rehydrated = JSON.parse(snapshot) as string;

    // Run assembly again
    const second = await assembleContext(db, { orgId, taskId });
    const secondSnapshot = JSON.stringify(second);

    expect(secondSnapshot).toBe(snapshot);
    expect(rehydrated).toBe(first);
  });

  test("snapshot round-trip preserves all sections", async () => {
    const assembled = await assembleContext(db, { orgId, taskId });
    expect(assembled).toContain("## Task");
    expect(assembled).toContain("Replay task");
    expect(assembled).toContain("## Documents");
    expect(assembled).toContain("Replay spec");
    expect(assembled).toContain("## Memory");
    expect(assembled).toContain("replay-value");
  });
});
