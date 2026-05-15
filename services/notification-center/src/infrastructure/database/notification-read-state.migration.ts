import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableColumn, TableIndex } from "typeorm";

export class NotificationReadState1778750400000 implements MigrationInterface {
  name = "NotificationReadState1778750400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_notifications",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "gen_random_uuid()",
          },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "rule_id", type: "uuid", isNullable: true },
          { name: "event_id", type: "uuid", isNullable: false },
          { name: "title", type: "varchar", length: "255", isNullable: false },
          { name: "body", type: "text", isNullable: false, default: "''" },
          { name: "entity_kind", type: "varchar", length: "255", isNullable: false },
          { name: "entity_id", type: "uuid", isNullable: false },
          { name: "read_at", type: "timestamptz", isNullable: true },
          { name: "trace_id", type: "varchar", length: "160", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );

    await addTraceColumnIfMissing(queryRunner);

    await queryRunner.query(`
      create unique index if not exists "uq_user_notifications_user_event_rule"
        on "user_notifications" ("user_id", "event_id", "rule_id") nulls not distinct
    `);

    await createIndexIfMissing(queryRunner, new TableIndex({
      name: "idx_user_notifications_org_user_read",
      columnNames: ["org_id", "user_id", "read_at"],
    }));
    await createIndexIfMissing(queryRunner, new TableIndex({
      name: "idx_user_notifications_org_user_created",
      columnNames: ["org_id", "user_id", "created_at"],
    }));
    await createIndexIfMissing(queryRunner, new TableIndex({
      name: "idx_user_notifications_trace",
      columnNames: ["trace_id"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_notifications", true);
  }
}

async function addTraceColumnIfMissing(queryRunner: QueryRunner): Promise<void> {
  const table = await queryRunner.getTable("user_notifications");
  if (table?.columns.some((candidate) => candidate.name === "trace_id")) return;
  await queryRunner.addColumn("user_notifications", new TableColumn({
    name: "trace_id",
    type: "varchar",
    length: "160",
    isNullable: true,
  }));
}

async function createIndexIfMissing(queryRunner: QueryRunner, index: TableIndex): Promise<void> {
  const table = await queryRunner.getTable("user_notifications");
  if (table?.indices.some((candidate) => candidate.name === index.name)) return;
  await queryRunner.createIndex("user_notifications", index);
}
