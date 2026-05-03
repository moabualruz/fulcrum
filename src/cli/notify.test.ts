import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run as runNotify } from "./notify.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import { createLocalOrg } from "../product-kernel/store/repositories.ts";
import {
  createNotification,
} from "../product-kernel/store/notifications.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-notify-cli-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return { lines, restore: () => { console.log = original; } };
}

async function seedDb() {
  const dbPath = join(productDbDir(), "main");
  await Bun.write(join(productDbDir(), ".keep"), "");
  const db = await openPglite(dbPath);
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Local" });
  return { db, org };
}

describe("fulcrum notify CLI", () => {
  test("notify list --json returns empty array when no notifications", async () => {
    const { db } = await seedDb();
    await db.close();
    const cap = captureStdout();
    try {
      await runNotify(["list", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toEqual([]);
  });

  test("notify list --unread --json filters to unread only", async () => {
    const { db, org } = await seedDb();
    await createNotification(db, {
      orgId: org.id, userId: "local", subjectKind: "task", subjectId: "t1",
      verb: "created", title: "Task created",
    });
    const read = await createNotification(db, {
      orgId: org.id, userId: "local", subjectKind: "task", subjectId: "t2",
      verb: "updated", title: "Task updated",
    });
    // mark one as read
    await db.query(`UPDATE user_notifications SET read_at = now() WHERE id = $1`, [read.id]);
    await db.close();

    const cap = captureStdout();
    try {
      await runNotify(["list", "--unread", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toHaveLength(1);
    expect(payload[0].subject_id).toBe("t1");
  });

  test("notify mark-read --all clears all unread", async () => {
    const { db, org } = await seedDb();
    await createNotification(db, {
      orgId: org.id, userId: "local", subjectKind: "task", subjectId: "t1",
      verb: "created", title: "A",
    });
    await createNotification(db, {
      orgId: org.id, userId: "local", subjectKind: "task", subjectId: "t2",
      verb: "created", title: "B",
    });
    await db.close();

    const cap = captureStdout();
    try {
      await runNotify(["mark-read", "--all"]);
    } finally {
      cap.restore();
    }
    expect(cap.lines.join("\n")).toContain("marked 2 notification(s) read");

    // Verify: list --unread should be empty
    const cap2 = captureStdout();
    try {
      await runNotify(["list", "--unread", "--json"]);
    } finally {
      cap2.restore();
    }
    expect(JSON.parse(cap2.lines.join("\n"))).toEqual([]);
  });

  test("notify mute --until parses ISO date and returns mute row as JSON", async () => {
    const { db } = await seedDb();
    await db.close();
    const cap = captureStdout();
    try {
      await runNotify(["mute", "task", "t1", "--until", "2026-12-31T00:00:00Z", "--json"]);
    } finally {
      cap.restore();
    }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.subject_kind).toBe("task");
    expect(payload.subject_id).toBe("t1");
    expect(payload.muted_until).toBeTruthy();
  });

  test("notify unmute removes mute", async () => {
    const { db } = await seedDb();
    await db.close();
    // First mute
    let cap = captureStdout();
    try { await runNotify(["mute", "task", "t1"]); } finally { cap.restore(); }

    // Then unmute
    cap = captureStdout();
    try { await runNotify(["unmute", "task", "t1"]); } finally { cap.restore(); }
    expect(cap.lines.join("\n")).toContain("unmuted task:t1");
  });

  test("notify rules create + list round-trip", async () => {
    const { db } = await seedDb();
    await db.close();

    // Create
    let cap = captureStdout();
    try {
      await runNotify([
        "rules", "create",
        "--name", "test-rule",
        "--pattern", '{"subject_kind":"task","verb":"created"}',
        "--channels", "in-app,email",
        "--json",
      ]);
    } finally {
      cap.restore();
    }
    const created = JSON.parse(cap.lines.join("\n"));
    expect(created.name).toBe("test-rule");
    expect(created.channels).toContain("in-app");
    expect(created.channels).toContain("email");

    // List
    cap = captureStdout();
    try {
      await runNotify(["rules", "list", "--json"]);
    } finally {
      cap.restore();
    }
    const rules = JSON.parse(cap.lines.join("\n"));
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("test-rule");
  });

  test("notify rules delete removes rule", async () => {
    const { db } = await seedDb();
    await db.close();

    // Create
    let cap = captureStdout();
    try {
      await runNotify(["rules", "create", "--name", "tmp", "--pattern", "{}", "--channels", "in-app", "--json"]);
    } finally { cap.restore(); }
    const created = JSON.parse(cap.lines.join("\n"));

    // Delete
    cap = captureStdout();
    try { await runNotify(["rules", "delete", created.id]); } finally { cap.restore(); }
    expect(cap.lines.join("\n")).toContain("deleted rule");

    // Verify gone
    cap = captureStdout();
    try { await runNotify(["rules", "list", "--json"]); } finally { cap.restore(); }
    expect(JSON.parse(cap.lines.join("\n"))).toEqual([]);
  });

  test("notify channels config + list with secret masking", async () => {
    const { db } = await seedDb();
    await db.close();

    // Config
    let cap = captureStdout();
    try {
      await runNotify(["channels", "config", "email", "--url", "smtp://localhost:25", "--secret", "s3cret", "--json"]);
    } finally { cap.restore(); }
    const configured = JSON.parse(cap.lines.join("\n"));
    expect(configured.kind).toBe("email");
    expect(configured.config.secret).toBe("****"); // masked

    // List
    cap = captureStdout();
    try { await runNotify(["channels", "list", "--json"]); } finally { cap.restore(); }
    const channels = JSON.parse(cap.lines.join("\n"));
    expect(channels).toHaveLength(1);
    expect(channels[0].config.secret).toBe("****"); // masked in list too
  });

  test("notify channels test returns queued message for configured channel", async () => {
    const { db } = await seedDb();
    await db.close();

    // First configure
    let cap = captureStdout();
    try { await runNotify(["channels", "config", "email", "--url", "smtp://localhost"]); } finally { cap.restore(); }

    // Then test
    cap = captureStdout();
    try { await runNotify(["channels", "test", "email"]); } finally { cap.restore(); }
    expect(cap.lines.join("\n")).toContain("test delivery queued");
  });

  test("notify help works", async () => {
    const cap = captureStdout();
    try { await runNotify(["--help"]); } finally { cap.restore(); }
    expect(cap.lines.join("\n")).toContain("fulcrum notify");
  });

  test("--json schema validated: list returns array of UserNotification shape", async () => {
    const { db, org } = await seedDb();
    await createNotification(db, {
      orgId: org.id, userId: "local", subjectKind: "task", subjectId: "t1",
      verb: "created", title: "Test",
    });
    await db.close();

    const cap = captureStdout();
    try { await runNotify(["list", "--json"]); } finally { cap.restore(); }
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(Array.isArray(payload)).toBe(true);
    const n = payload[0];
    expect(n).toHaveProperty("id");
    expect(n).toHaveProperty("org_id");
    expect(n).toHaveProperty("user_id");
    expect(n).toHaveProperty("subject_kind");
    expect(n).toHaveProperty("subject_id");
    expect(n).toHaveProperty("verb");
    expect(n).toHaveProperty("title");
    expect(n).toHaveProperty("read_at");
    expect(n).toHaveProperty("created_at");
  });
});
