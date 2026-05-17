import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableColumn, TableIndex } from "typeorm";

export class WorkAutomations1778752500000 implements MigrationInterface {
  name = "WorkAutomations1778752500000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: "fulcrum_work_automations",
      columns: [
        varchar("id", { primary: true }),
        varchar("org_id"),
        varchar("project_id"),
        varchar("name", { length: "255" }),
        varchar("trigger_type", { length: "160" }),
        jsonb("trigger_config", { nullable: true }),
        jsonb("condition", { nullable: true }),
        varchar("action_type", { length: "160" }),
        jsonb("action_config", { nullable: true }),
        new TableColumn({ name: "enabled", type: "boolean", isNullable: false, default: true }),
        new TableColumn({ name: "execution_count", type: "integer", isNullable: false, default: 0 }),
        timestamp("created_at", { default: "now()" }),
        timestamp("updated_at", { default: "now()" }),
      ],
    }));
    await queryRunner.createIndex("fulcrum_work_automations", new TableIndex({
      name: "fulcrum_work_automations_org_project_idx",
      columnNames: ["org_id", "project_id"],
    }));
    await queryRunner.createIndex("fulcrum_work_automations", new TableIndex({
      name: "fulcrum_work_automations_org_enabled_idx",
      columnNames: ["org_id", "enabled"],
    }));
    await queryRunner.createIndex("fulcrum_work_automations", new TableIndex({
      name: "fulcrum_work_automations_trigger_idx",
      columnNames: ["org_id", "trigger_type"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_work_automations", true);
  }
}

function varchar(
  name: string,
  options: { primary?: boolean; length?: string } = {},
): TableColumn {
  return new TableColumn({
    name,
    type: "varchar",
    length: options.length ?? "128",
    isPrimary: options.primary ?? false,
    isNullable: false,
  });
}

function jsonb(name: string, options: { nullable?: boolean } = {}): TableColumn {
  return new TableColumn({
    name,
    type: "jsonb",
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
