import { describe, expect, it } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { ConnectorSyncLog } from "@platform-core/infrastructure/application-database/entities/connectors/index.ts";

const CONNECTOR_ORG_ID = "11111111-1111-1111-1111-111111111111";

describe("ConnectorSyncLog entity metadata", () => {
  it("exports ConnectorSyncLog with org, connector, status, last run, and error fields", async () => {
    expect(ConnectorSyncLog).toBeDefined();

    const db = await createTestOrm();
    try {
      const meta = db.orm.getMetadata().get(ConnectorSyncLog);
      expect(meta.tableName).toBe("connector_sync_log");
      expect(meta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(meta.properties["connector"]?.fieldNames).toEqual(["connector"]);
      expect(meta.properties["status"]?.fieldNames).toEqual(["status"]);
      expect(meta.properties["lastRunAt"]?.fieldNames).toEqual(["last_run_at"]);
      expect(meta.properties["error"]?.fieldNames).toEqual(["error"]);
      expect(meta.indexes?.map((index) => index.name)).toContain(
        "connector_sync_log_org_connector",
      );
    } finally {
      await db.close();
    }
  });
});

describe("ConnectorSyncLog migration constraints", () => {
  it("creates connector_sync_log table, columns, composite index, FK, and is idempotent", async () => {
    const db = await createTestOrm();
    try {
      const columns = await db.pglite.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'connector_sync_log' order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "connector",
        "error",
        "id",
        "last_run_at",
        "org_id",
        "status",
      ]);

      const constraints = await db.pglite.query<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'connector_sync_log'::regclass order by conname`,
      );
      const constraintNames = constraints.rows.map((row) => row.conname);
      expect(constraintNames).toContain("connector_sync_log_pkey");
      expect(constraintNames).toContain("connector_sync_log_org_id_foreign");

      const indexes = await db.pglite.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public' and tablename = 'connector_sync_log'`,
      );
      const indexNames = indexes.rows.map((row) => row.indexname);
      expect(indexNames).toContain("connector_sync_log_org_connector");

      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("persists sync log rows and cascades when org is deleted", async () => {
    const db = await createTestOrm();
    try {
      await db.pglite.query(
        `insert into "orgs" ("id", "name", "slug") values ('${CONNECTOR_ORG_ID}', 'Connector Org', 'connector-org')`,
      );
      const em = db.orm.em.fork();
      await em.getRepository(ConnectorSyncLog).insert({
        org: em.getReference(Org, CONNECTOR_ORG_ID),
        connector: "jira",
        status: "success",
        lastRunAt: new Date("2026-05-03T12:00:00.000Z"),
        error: null,
      });

      await db.pglite.query(`delete from "orgs" where "id" = '${CONNECTOR_ORG_ID}'`);

      const rows = await db.pglite.query<{ count: string }>(
        `select count(*)::text from "connector_sync_log" where "connector" = 'jira'`,
      );
      expect(rows.rows[0]?.count).toBe("0");
    } finally {
      await db.close();
    }
  });
});
