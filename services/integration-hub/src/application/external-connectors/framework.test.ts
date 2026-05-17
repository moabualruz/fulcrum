import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import {
  ConnectorBase,
  type UpsertTaskInput,
  isFeatureEnabled,
  runConnectorJob,
  doctorConnectorCheck,
} from "./framework.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-connectors-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

// Mock connector returning fixed items.
class MockConnector extends ConnectorBase {
  readonly name = "mock";
  readonly flag = "connector-mock";
  constructor(private items: UpsertTaskInput[]) {
    super();
  }
  async fetch() {
    return this.items;
  }
}

describe("isFeatureEnabled", () => {
  test("returns true when flag present in FULCRUM_FEATURES", () => {
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock,connector-jira";
      expect(isFeatureEnabled("connector-mock")).toBe(true);
      expect(isFeatureEnabled("connector-jira")).toBe(true);
      expect(isFeatureEnabled("connector-linear")).toBe(false);
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
    }
  });

  test("returns false when FULCRUM_FEATURES unset", () => {
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      delete process.env["FULCRUM_FEATURES"];
      expect(isFeatureEnabled("connector-mock")).toBe(false);
    } finally {
      if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
    }
  });
});

describe("runConnectorJob", () => {
  test("imports 3 items on first run", async () => {
    const db = await freshDb("import3");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const connector = new MockConnector([
        { external_id: "mock:1", title: "A", status: "pending" },
        { external_id: "mock:2", title: "B", status: "completed" },
        { external_id: "mock:3", title: "C", status: "pending", labels: ["bug", "urgent"] },
      ]);

      const result = await runConnectorJob(db, connector, org.id);
      expect(result.imported).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);

      // Verify rows in DB.
      const tasks = await db.query<{ external_id: string; title: string }>(
        `SELECT external_id, title FROM tasks WHERE org_id = $1 ORDER BY external_id`,
        [org.id],
      );
      expect(tasks.length).toBe(3);
      expect(tasks[0]!.external_id).toBe("mock:1");

      // Verify labels created.
      const labels = await db.query<{ name: string }>(
        `SELECT name FROM labels WHERE org_id = $1 ORDER BY name`,
        [org.id],
      );
      expect(labels.map((l) => l.name)).toEqual(["bug", "urgent"]);

      // Verify task_labels junction.
      const taskC = await db.query<{ id: string }>(
        `SELECT id FROM tasks WHERE external_id = $1`,
        ["mock:3"],
      );
      const tl = await db.query<{ label_id: string }>(
        `SELECT label_id FROM task_labels WHERE task_id = $1`,
        [taskC[0]!.id],
      );
      expect(tl.length).toBe(2);
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("second run updates, does not duplicate", async () => {
    const db = await freshDb("upsert");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      const items: UpsertTaskInput[] = [
        { external_id: "mock:1", title: "Original", status: "pending" },
      ];
      await runConnectorJob(db, new MockConnector(items), org.id);

      // Second run with updated title.
      items[0] = { external_id: "mock:1", title: "Updated", status: "completed" };
      const result = await runConnectorJob(db, new MockConnector(items), org.id);
      expect(result.imported).toBe(0);
      expect(result.updated).toBe(1);

      const tasks = await db.query<{ title: string; status: string }>(
        `SELECT title, status FROM tasks WHERE org_id = $1 AND external_id = $2`,
        [org.id, "mock:1"],
      );
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.title).toBe("Updated");
      expect(tasks[0]!.status).toBe("completed");
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("flag OFF throws, no items imported", async () => {
    const db = await freshDb("flagoff");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      delete process.env["FULCRUM_FEATURES"];
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const connector = new MockConnector([
        { external_id: "mock:1", title: "A", status: "pending" },
      ]);

      await expect(runConnectorJob(db, connector, org.id)).rejects.toThrow(
        'Feature flag "connector-mock" is not enabled',
      );

      const tasks = await db.query<{ id: string }>(`SELECT id FROM tasks WHERE org_id = $1`, [
        org.id,
      ]);
      expect(tasks.length).toBe(0);
    } finally {
      if (orig !== undefined) process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("sync log written on success", async () => {
    const db = await freshDb("synclog");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await runConnectorJob(
        db,
        new MockConnector([{ external_id: "mock:1", title: "A", status: "pending" }]),
        org.id,
      );

      const logs = await db.query<{ connector: string; status: string }>(
        `SELECT connector, status FROM connector_sync_log WHERE org_id = $1 ORDER BY created_at`,
        [org.id],
      );
      // running + succeeded.
      expect(logs.length).toBe(2);
      expect(logs[0]!.status).toBe("running");
      expect(logs[1]!.status).toBe("succeeded");
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("milestone creates sprint, second run matches existing", async () => {
    const db = await freshDb("sprints");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      const items: UpsertTaskInput[] = [
        {
          external_id: "mock:1",
          title: "A",
          status: "pending",
          sprint_external_id: "github:milestone:1",
          sprint_title: "v1.0",
          sprint_start_date: "2025-01-01T00:00:00Z",
          sprint_end_date: "2025-01-31T00:00:00Z",
        },
      ];

      await runConnectorJob(db, new MockConnector(items), org.id);

      const sprints = await db.query<{ title: string; external_id: string }>(
        `SELECT title, external_id FROM sprints WHERE org_id = $1`,
        [org.id],
      );
      expect(sprints.length).toBe(1);
      expect(sprints[0]!.title).toBe("v1.0");
      expect(sprints[0]!.external_id).toBe("github:milestone:1");

      // Second task with same milestone — no new sprint created.
      items.push({
        external_id: "mock:2",
        title: "B",
        status: "pending",
        sprint_external_id: "github:milestone:1",
        sprint_title: "v1.0",
      });
      await runConnectorJob(db, new MockConnector(items), org.id);

      const sprints2 = await db.query<{ id: string }>(
        `SELECT id FROM sprints WHERE org_id = $1`,
        [org.id],
      );
      expect(sprints2.length).toBe(1);
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("label reuse — existing labels matched by name", async () => {
    const db = await freshDb("labelreuse");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });

      // First run creates "bug" label.
      await runConnectorJob(
        db,
        new MockConnector([
          { external_id: "mock:1", title: "A", status: "pending", labels: ["bug"] },
        ]),
        org.id,
      );

      // Second item also has "bug" — should reuse, not duplicate.
      await runConnectorJob(
        db,
        new MockConnector([
          { external_id: "mock:1", title: "A", status: "pending", labels: ["bug"] },
          { external_id: "mock:2", title: "B", status: "pending", labels: ["bug", "feature"] },
        ]),
        org.id,
      );

      const labels = await db.query<{ name: string }>(
        `SELECT name FROM labels WHERE org_id = $1 ORDER BY name`,
        [org.id],
      );
      expect(labels.map((l) => l.name)).toEqual(["bug", "feature"]);
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });

  test("doctorConnectorCheck returns latest sync per connector", async () => {
    const db = await freshDb("doctor");
    const orig = process.env["FULCRUM_FEATURES"];
    try {
      process.env["FULCRUM_FEATURES"] = "connector-mock";
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      await runConnectorJob(
        db,
        new MockConnector([{ external_id: "mock:1", title: "A", status: "pending" }]),
        org.id,
      );

      const health = await doctorConnectorCheck(db, org.id);
      expect(health.length).toBeGreaterThanOrEqual(1);
      const mock = health.find((h) => h.connector === "mock");
      expect(mock).toBeDefined();
      expect(mock!.status).toBe("succeeded");
    } finally {
      if (orig === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = orig;
      await db.close();
    }
  });
});
