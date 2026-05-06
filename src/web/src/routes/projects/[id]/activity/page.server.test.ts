import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  appendEvent,
  listEventsFiltered,
  listEventsForEntity,
} from "../../../../../../test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-activity-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id, slug: "alpha", name: "Alpha",
  });
  return { db, org, project };
}

describe("/projects/<id>/activity — filtered events", () => {
  test("listEventsFiltered filters by project", async () => {
    const { db, org, project } = await seedDb();
    const p2 = await createProject(db, {
      orgId: org.id, slug: "beta", name: "Beta",
    });

    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: p2.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "created",
    });

    const result = await listEventsFiltered(db, {
      orgId: org.id, projectId: project.id,
    });
    // project alpha: project.created event + task created = 2 (from createProject auto-event + explicit)
    // But p2 events excluded
    expect(result.every((e) => e.project_id === project.id)).toBe(true);
    await db.close();
  });

  test("listEventsFiltered filters by subjectKind and verb", async () => {
    const { db, org, project } = await seedDb();
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "status_changed",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t2", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "doc", subjectId: "d1", verb: "status_changed",
    });

    const result = await listEventsFiltered(db, {
      orgId: org.id, subjectKind: "task", verb: "status_changed",
    });
    expect(result.length).toBe(1);
    expect(result[0]!.subject_kind).toBe("task");
    expect(result[0]!.verb).toBe("status_changed");
    await db.close();
  });

  test("listEventsFiltered filters by actor", async () => {
    const { db, org, project } = await seedDb();
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "created",
    });

    const result = await listEventsFiltered(db, {
      orgId: org.id, actorId: "bob",
    });
    expect(result.every((e) => e.actor === "bob")).toBe(true);
    await db.close();
  });
});

describe("per-entity activity", () => {
  test("listEventsForEntity scopes to entity_id", async () => {
    const { db, org, project } = await seedDb();
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "created",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "alice",
      subjectKind: "task", subjectId: "t1", verb: "status_changed",
    });
    await appendEvent(db, {
      orgId: org.id, projectId: project.id, actor: "bob",
      subjectKind: "task", subjectId: "t2", verb: "created",
    });

    const result = await listEventsForEntity(db, "task", "t1");
    expect(result.length).toBe(2);
    expect(result.every((e) => e.subject_id === "t1")).toBe(true);
    // DESC order
    expect(result[0]!.verb).toBe("status_changed");
    await db.close();
  });

  test("listEventsForEntity respects limit", async () => {
    const { db, org, project } = await seedDb();
    for (let i = 0; i < 5; i++) {
      await appendEvent(db, {
        orgId: org.id, projectId: project.id, actor: "alice",
        subjectKind: "task", subjectId: "t1", verb: `action_${i}`,
      });
    }

    const result = await listEventsForEntity(db, "task", "t1", { limit: 3 });
    expect(result.length).toBe(3);
    await db.close();
  });
});
