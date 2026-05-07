import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg, appendEvent } from "@/test-support/product-fixtures.ts";

mock.module("$lib/server/db", () => {
  const { join: j } = require("node:path");
  const { openIsolatedStore: oP } = require("../../../../test-support/product-fixtures.ts");
  const { migrateIsolatedStore: rM } = require("../../../../test-support/product-fixtures.ts");
  return {
    openIsolatedStore: async () => {
      const scratch = process.env["FULCRUM_HOME"]!;
      const dbDir = j(scratch, "state", "product", "db");
      const { mkdirSync: mk } = require("node:fs");
      mk(dbDir, { recursive: true });
      const db = await oP(j(dbDir, "main"));
      await rM(db);
      return db;
    },
  };
});

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-audit-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function loadEvent(params: Record<string, string> = {}): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/audit");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url } as Parameters<typeof import("./+page.server.ts").load>[0];
}

async function setupDb(): Promise<{ orgId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  try {
    await migrateIsolatedStore(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    return { orgId: org.id };
  } finally {
    await db.close();
  }
}

async function seedEvents(orgId: string): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  const db = await openIsolatedStore(join(dbDir, "main"));
  try {
    await db.query(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      ["project-1", orgId, "project-1", "Project 1"],
    );
    await appendEvent(db, { orgId, actor: "system", subjectKind: "task", subjectId: "task-1", verb: "created" });
    await appendEvent(db, { orgId, actor: "local", subjectKind: "doc", subjectId: "doc-1", verb: "updated" });
    await appendEvent(db, { orgId, actor: "local", subjectKind: "task", subjectId: "task-2", verb: "closed" });
    await appendEvent(db, { orgId, actor: "agent", projectId: "project-1", subjectKind: "task", subjectId: "task-3", verb: "updated" });
  } finally {
    await db.close();
  }
}

describe("/audit +page.server.ts load()", () => {
  test("returns empty when no events", async () => {
    await setupDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent());
    expect(result.events).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test("returns all events unfiltered", async () => {
    const { orgId } = await setupDb();
    await seedEvents(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(loadEvent());
    expect(result.events).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  test("filter by kind=task returns only task events", async () => {
    const { orgId } = await setupDb();
    await seedEvents(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(loadEvent({ kind: "task" }));
    expect(result.events).toHaveLength(3);
    for (const ev of result.events) {
      expect(ev.subject_kind).toBe("task");
    }
  });

  test("filter by verb and project returns only matching events", async () => {
    const { orgId } = await setupDb();
    await seedEvents(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.load(loadEvent({ verb: "updated", project: "project-1" }));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.verb).toBe("updated");
    expect(result.events[0]!.project_id).toBe("project-1");
  });

  test("page exposes actor, subject kind, verb, date range, and project filters", async () => {
    const source = await Bun.file(new URL("./+page.svelte", import.meta.url)).text();
    for (const field of ["name=\"actor\"", "name=\"kind\"", "name=\"verb\"", "name=\"date_from\"", "name=\"date_to\"", "name=\"project\""]) {
      expect(source).toContain(field);
    }
  });

  test("filter by actor=system returns only system events", async () => {
    const { orgId } = await setupDb();
    await seedEvents(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(loadEvent({ actor: "system" }));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.actor).toBe("system");
  });

  test("pagination: page 2 of 26 events returns 1 row", async () => {
    const { orgId } = await setupDb();
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openIsolatedStore(join(dbDir, "main"));
    try {
      for (let i = 0; i < 26; i++) {
        await appendEvent(db, { orgId, actor: "system", subjectKind: "doc", subjectId: `doc-${i}`, verb: "indexed" });
      }
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(loadEvent({ page: "2" }));
    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(26);
  });
});
