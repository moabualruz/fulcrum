import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableCheck, TableIndex, TableUnique } from "typeorm";

export class IntegrationWebhooks1778750700000 implements MigrationInterface {
  name = "IntegrationWebhooks1778750700000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "webhooks",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "name", type: "varchar", length: "255", isNullable: false },
          { name: "url", type: "text", isNullable: false },
          { name: "encrypted_secret", type: "text", isNullable: true },
          { name: "events_filter", type: "jsonb", isNullable: true },
          { name: "enabled", type: "boolean", isNullable: false, default: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "last_delivery_at", type: "timestamptz", isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "webhook_deliveries",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "webhook_id", type: "uuid", isNullable: false },
          { name: "event_id", type: "uuid", isNullable: true },
          { name: "status", type: "varchar", length: "32", isNullable: false, default: "'pending'" },
          { name: "attempt", type: "integer", isNullable: false, default: 1 },
          { name: "payload", type: "jsonb", isNullable: true },
          { name: "response_code", type: "integer", isNullable: true },
          { name: "error", type: "text", isNullable: true },
          { name: "next_retry_at", type: "timestamptz", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );

    await createUniqueIfMissing(queryRunner, "webhooks", new TableUnique({
      name: "uq_webhooks_org_name",
      columnNames: ["org_id", "name"],
    }));
    await createIndexIfMissing(queryRunner, "webhooks", new TableIndex({
      name: "idx_webhooks_org_enabled",
      columnNames: ["org_id", "enabled"],
    }));
    await createIndexIfMissing(queryRunner, "webhooks", new TableIndex({
      name: "idx_webhooks_org_created",
      columnNames: ["org_id", "created_at"],
    }));
    await createCheckIfMissing(queryRunner, "webhook_deliveries", new TableCheck({
      name: "chk_webhook_deliveries_status",
      expression: `"status" in ('pending', 'delivered', 'failed', 'retrying')`,
    }));
    await createIndexIfMissing(queryRunner, "webhook_deliveries", new TableIndex({
      name: "idx_webhook_deliveries_org_webhook_status",
      columnNames: ["org_id", "webhook_id", "status"],
    }));
    await createIndexIfMissing(queryRunner, "webhook_deliveries", new TableIndex({
      name: "idx_webhook_deliveries_next_retry",
      columnNames: ["next_retry_at"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("webhook_deliveries", true);
    await queryRunner.dropTable("webhooks", true);
  }
}

async function createIndexIfMissing(queryRunner: QueryRunner, tableName: string, index: TableIndex): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.indices.some((candidate) => candidate.name === index.name)) return;
  await queryRunner.createIndex(tableName, index);
}

async function createUniqueIfMissing(queryRunner: QueryRunner, tableName: string, unique: TableUnique): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.uniques.some((candidate) => candidate.name === unique.name)) return;
  await queryRunner.createUniqueConstraint(tableName, unique);
}

async function createCheckIfMissing(queryRunner: QueryRunner, tableName: string, check: TableCheck): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.checks.some((candidate) => candidate.name === check.name)) return;
  await queryRunner.createCheckConstraint(tableName, check);
}
