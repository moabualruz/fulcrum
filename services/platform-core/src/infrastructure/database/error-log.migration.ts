import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableForeignKey, TableIndex } from "typeorm";

export class ErrorLog1778758800000 implements MigrationInterface {
  name = "ErrorLog1778758800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_error_logs",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "user_id", type: "varchar", length: "128", isNullable: true },
          { name: "occurred_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "os", type: "varchar", length: "80", isNullable: true },
          { name: "arch", type: "varchar", length: "80", isNullable: true },
          { name: "bun_version", type: "varchar", length: "80", isNullable: true },
          { name: "fulcrum_version", type: "varchar", length: "80", isNullable: true },
          { name: "recent_cli_command", type: "text", isNullable: true },
          { name: "recent_procedure", type: "varchar", length: "255", isNullable: true },
          { name: "error_message", type: "text", isNullable: false },
          { name: "stack_trace", type: "text", isNullable: true },
          { name: "context", type: "jsonb", isNullable: false, default: "'{}'::jsonb" },
        ],
      }),
      true,
    );
    await createForeignKeyIfMissing(queryRunner, "fulcrum_error_logs", new TableForeignKey({
      name: "fulcrum_error_logs_org_fk",
      columnNames: ["org_id"],
      referencedTableName: "fulcrum_workspaces",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_error_logs", new TableIndex({
      name: "fulcrum_error_logs_org_occurred_idx",
      columnNames: ["org_id", "occurred_at"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_error_logs", true);
  }
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
