import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableForeignKey, TableIndex, TableUnique } from "typeorm";

export class Telemetry1778755200000 implements MigrationInterface {
  name = "Telemetry1778755200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_telemetry_settings",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "opted_in", type: "boolean", isNullable: false, default: false },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_telemetry_events",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "user_id", type: "varchar", length: "128", isNullable: true },
          { name: "kind", type: "varchar", length: "160", isNullable: false },
          { name: "payload", type: "jsonb", isNullable: false, default: "'{}'::jsonb" },
          { name: "occurred_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );

    await createUniqueIfMissing(queryRunner, "fulcrum_telemetry_settings", new TableUnique({
      name: "fulcrum_telemetry_settings_org_key",
      columnNames: ["org_id"],
    }));
    await createForeignKeyIfMissing(queryRunner, "fulcrum_telemetry_settings", new TableForeignKey({
      name: "fulcrum_telemetry_settings_org_fk",
      columnNames: ["org_id"],
      referencedTableName: "fulcrum_workspaces",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createForeignKeyIfMissing(queryRunner, "fulcrum_telemetry_events", new TableForeignKey({
      name: "fulcrum_telemetry_events_org_fk",
      columnNames: ["org_id"],
      referencedTableName: "fulcrum_workspaces",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_telemetry_events", new TableIndex({
      name: "fulcrum_telemetry_events_org_occurred_idx",
      columnNames: ["org_id", "occurred_at"],
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_telemetry_events", new TableIndex({
      name: "fulcrum_telemetry_events_org_user_kind_idx",
      columnNames: ["org_id", "user_id", "kind"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_telemetry_events", true);
    await queryRunner.dropTable("fulcrum_telemetry_settings", true);
  }
}

async function createUniqueIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  unique: TableUnique,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.uniques.some((candidate) => candidate.name === unique.name)) return;
  await queryRunner.createUniqueConstraint(tableName, unique);
}

async function createForeignKeyIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  foreignKey: TableForeignKey,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.foreignKeys.some((candidate) => candidate.name === foreignKey.name)) return;
  await queryRunner.createForeignKey(tableName, foreignKey);
}

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.indices.some((candidate) => candidate.name === index.name)) return;
  await queryRunner.createIndex(tableName, index);
}
