import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  type EventRow,
} from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import {
  upsertProjectConnector,
  syncProjectConnector,
  listProjectConnectors,
} from "./project-connectors.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-proj-connectors-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string): Promise<{ db: TestStore; orgId: string; projectId: string }> {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const proj = await createProject(db, { orgId: org.id, slug: "test", name: "Test" });
  return { db, orgId: org.id, projectId: proj.id };
}

async function readEvents(db: TestStore, subjectId: string): Promise<EventRow[]> {
  return db.query<EventRow>(
    `SELECT * FROM events WHERE subject_id = $1 ORDER BY created_at ASC, id ASC`,
    [subjectId],
  );
}

describe("project-connectors CRUD", () => {
  test("upsert creates connector + list", async () => {
    const { db, orgId, projectId } = await freshDb("create");
    try {
      const { id } = await upsertProjectConnector(db, {
        orgId,
        projectId,
        connectorType: "jira",
        config: { host: "jira.example.com" },
      });
      const connectors = await listProjectConnectors(db, projectId);
      expect(connectors).toHaveLength(1);
      expect(connectors[0]!.connector_type).toBe("jira");
      expect(connectors[0]!.enabled).toBe(false);
      expect(connectors[0]!.config).toEqual({ host: "jira.example.com" });

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "created")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("upsert updates existing connector", async () => {
    const { db, orgId, projectId } = await freshDb("upsert-update");
    try {
      const { id: id1 } = await upsertProjectConnector(db, {
        orgId, projectId, connectorType: "jira",
      });
      const { id: id2 } = await upsertProjectConnector(db, {
        orgId, projectId, connectorType: "jira", enabled: true, config: { host: "new.example.com" },
      });
      expect(id2).toBe(id1);

      const connectors = await listProjectConnectors(db, projectId);
      expect(connectors).toHaveLength(1);
      expect(connectors[0]!.enabled).toBe(true);
      expect(connectors[0]!.config).toEqual({ host: "new.example.com" });
    } finally {
      await db.close();
    }
  });

  test("sync enabled connector", async () => {
    const { db, orgId, projectId } = await freshDb("sync-ok");
    try {
      const { id } = await upsertProjectConnector(db, {
        orgId, projectId, connectorType: "jira", enabled: true,
      });
      const result = await syncProjectConnector(db, id);
      expect(result).toEqual({ ok: true });

      const connectors = await listProjectConnectors(db, projectId);
      expect(connectors[0]!.last_synced_at).not.toBeNull();

      const events = await readEvents(db, id);
      expect(events.some((e) => e.verb === "synced")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("sync disabled connector throws", async () => {
    const { db, orgId, projectId } = await freshDb("sync-disabled");
    try {
      const { id } = await upsertProjectConnector(db, {
        orgId, projectId, connectorType: "jira", enabled: false,
      });
      expect(syncProjectConnector(db, id)).rejects.toThrow(/not enabled/);
    } finally {
      await db.close();
    }
  });

  test("sync missing connector throws", async () => {
    const { db } = await freshDb("sync-missing");
    try {
      expect(syncProjectConnector(db, "01J0NONEXISTENT0000000000")).rejects.toThrow(/not found/);
    } finally {
      await db.close();
    }
  });
});
