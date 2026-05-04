import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { createLocalOrg, appendEvent } from "../../../../product-kernel/store/repositories.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

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
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-inbox-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function loadEvent(params: Record<string, string> = {}): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/inbox");
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

async function seedNotification(orgId: string, readAt: string | null = null): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  const db = await openPglite(join(dbDir, "main"));
  try {
    const id = newUlid();
    await db.query(
      `INSERT INTO notifications (id, org_id, recipient, subject_kind, subject_id, verb, actor, read_at)
       VALUES ($1, $2, 'local', 'task', 'task-1', 'created', 'system', $3)`,
      [id, orgId, readAt],
    );
  } finally {
    await db.close();
  }
}

async function seedActivity(orgId: string): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  const db = await openPglite(join(dbDir, "main"));
  try {
    await appendEvent(db, {
      orgId,
      actor: "local",
      subjectKind: "task",
      subjectId: "task-1",
      verb: "created",
    });
  } finally {
    await db.close();
  }
}

describe("/inbox +page.server.ts load()", () => {
  test("returns empty inbox when no data", async () => {
    await setupDb();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(loadEvent());
    expect(result.notifications).toHaveLength(0);
    expect(result.unreadCount).toBe(0);
    expect(result.activity).toHaveLength(0);
  });

  test("counts unread notifications correctly", async () => {
    const { orgId } = await setupDb();
    await seedNotification(orgId, null); // unread
    await seedNotification(orgId, "2026-04-01T00:00:00Z"); // read
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(loadEvent());
    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toHaveLength(2);
  });

  test("notification cards contain actor, verb, subject fields", async () => {
    const { orgId } = await setupDb();
    await seedNotification(orgId, null);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(loadEvent());
    const n = result.notifications[0];
    expect(n.actor).toBe("system");
    expect(n.verb).toBe("created");
    expect(n.subject_kind).toBe("task");
  });

  test("activity lists events where actor=local", async () => {
    const { orgId } = await setupDb();
    await seedActivity(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(loadEvent());
    expect(result.activity).toHaveLength(1);
    expect(result.activity[0]!.actor).toBe("local");
  });

  test("activity pagination: page 2 with 21 events returns 1 row", async () => {
    const { orgId } = await setupDb();
    for (let i = 0; i < 21; i++) await seedActivity(orgId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(loadEvent({ activity_page: "2" }));
    expect(result.activity).toHaveLength(1);
    expect(result.activityTotal).toBe(21);
  });
});

describe("/inbox +page.server.ts actions.markAllRead()", () => {
  test("marks all unread notifications as read", async () => {
    const { orgId } = await setupDb();
    await seedNotification(orgId, null);
    await seedNotification(orgId, null);

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    await mod.actions.markAllRead({ request: new Request("http://localhost", { method: "POST" }) });

    const result = await mod.load(loadEvent());
    expect(result.unreadCount).toBe(0);
  });
});
