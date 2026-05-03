import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, appendEvent } from "../../../../product-kernel/store/repositories.ts";

mock.module("$lib/server/db", () => {
  const { join: j } = require("node:path");
  const { openPglite: oP } = require("../../../../product-kernel/db/pglite.ts");
  const { runMigrations: rM } = require("../../../../product-kernel/db/migrate.ts");
  return {
    openProductDb: async () => {
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
  const db = await openPglite(join(dbDir, "main"));
  try {
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    return { orgId: org.id };
  } finally {
    await db.close();
  }
}

async function seedEvents(orgId: string): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  const db = await openPglite(join(dbDir, "main"));
  try {
    await appendEvent(db, { orgId, actor: "system", subjectKind: "task", subjectId: "task-1", verb: "created" });
    await appendEvent(db, { orgId, actor: "local", subjectKind: "doc", subjectId: "doc-1", verb: "updated" });
    await appendEvent(db, { orgId, actor: "local", subjectKind: "task", subjectId: "task-2", verb: "closed" });
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
    expect(result.events).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  test("filter by kind=task returns only task events", async () => {
    const { orgId } = await setupDb();
    await seedEvents(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(loadEvent({ kind: "task" }));
    expect(result.events).toHaveLength(2);
    for (const ev of result.events) {
      expect(ev.subject_kind).toBe("task");
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
    const db = await openPglite(join(dbDir, "main"));
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
