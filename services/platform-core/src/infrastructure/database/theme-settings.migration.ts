import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex, TableUnique } from "typeorm";

export class ThemeSettings1778759000000 implements MigrationInterface {
  name = "ThemeSettings1778759000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_theme_settings",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "user_id", type: "varchar", length: "128", isNullable: false },
          { name: "setting_key", type: "varchar", length: "160", isNullable: false },
          { name: "setting_value", type: "text", isNullable: false },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await createUniqueIfMissing(queryRunner, "fulcrum_theme_settings", new TableUnique({
      name: "fulcrum_theme_settings_scope_key",
      columnNames: ["org_id", "user_id", "setting_key"],
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_theme_settings", new TableIndex({
      name: "fulcrum_theme_settings_scope_idx",
      columnNames: ["org_id", "user_id"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_theme_settings", true);
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

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.indices.some((candidate) => candidate.name === index.name)) return;
  await queryRunner.createIndex(tableName, index);
}
