import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableColumn, TableIndex } from "typeorm";

export class PlatformFeatureFlags1778753400000 implements MigrationInterface {
  name = "PlatformFeatureFlags1778753400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: "fulcrum_feature_flags",
      columns: [
        varchar("id", { primary: true }),
        varchar("org_id", { nullable: true }),
        varchar("user_id", { nullable: true }),
        varchar("flag", { length: "160" }),
        new TableColumn({ name: "enabled", type: "boolean", isNullable: false, default: false }),
        new TableColumn({ name: "rollout_percent", type: "integer", isNullable: false, default: 100 }),
        timestamp("created_at", { default: "now()" }),
        timestamp("updated_at", { default: "now()" }),
      ],
    }));
    await queryRunner.createIndex("fulcrum_feature_flags", new TableIndex({
      name: "fulcrum_feature_flags_scope_idx",
      columnNames: ["org_id", "user_id", "flag"],
    }));
    await queryRunner.createIndex("fulcrum_feature_flags", new TableIndex({
      name: "fulcrum_feature_flags_flag_idx",
      columnNames: ["flag"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_feature_flags", true);
  }
}

function varchar(
  name: string,
  options: { primary?: boolean; length?: string; nullable?: boolean } = {},
): TableColumn {
  return new TableColumn({
    name,
    type: "varchar",
    length: options.length ?? "128",
    isPrimary: options.primary ?? false,
    isNullable: options.nullable ?? false,
  });
}

function timestamp(
  name: string,
  options: { nullable?: boolean; default?: string } = {},
): TableColumn {
  return new TableColumn({
    name,
    type: "timestamptz",
    isNullable: options.nullable ?? false,
    default: options.default,
  });
}
