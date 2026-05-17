import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableIndex, TableUnique } from "typeorm";

export class TenantSetting1778800000000 implements MigrationInterface {
  name = "TenantSetting1778800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "tenant_settings",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "key", type: "varchar", length: "256", isNullable: false },
          { name: "value", type: "jsonb", isNullable: false, default: "'{}'::jsonb" },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await createUniqueIfMissing(queryRunner, "tenant_settings", new TableUnique({
      name: "uq_tenant_settings_org_key",
      columnNames: ["org_id", "key"],
    }));
    await createIndexIfMissing(queryRunner, "tenant_settings", new TableIndex({
      name: "tenant_settings_org_key_idx",
      columnNames: ["org_id", "key"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("tenant_settings", true);
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
