import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableColumn, TableIndex, TableUnique } from "typeorm";

export class IntegrationConnectors1778751600000 implements MigrationInterface {
  name = "IntegrationConnectors1778751600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: "fulcrum_connector_states",
      columns: [
        varchar("id", { primary: true }),
        varchar("org_id"),
        varchar("connector_id"),
        new TableColumn({ name: "enabled", type: "boolean", isNullable: false, default: false }),
        new TableColumn({ name: "config_json", type: "jsonb", isNullable: true }),
        timestamp("created_at", { default: "now()" }),
        timestamp("updated_at", { default: "now()" }),
      ],
      uniques: [
        new TableUnique({
          name: "fulcrum_connector_states_org_connector_key",
          columnNames: ["org_id", "connector_id"],
        }),
      ],
    }));
    await queryRunner.createIndex("fulcrum_connector_states", new TableIndex({
      name: "fulcrum_connector_states_org_enabled_idx",
      columnNames: ["org_id", "enabled"],
    }));

    await queryRunner.createTable(new Table({
      name: "fulcrum_connector_runs",
      columns: [
        varchar("id", { primary: true }),
        varchar("org_id"),
        varchar("connector_id"),
        varchar("status", { length: "40" }),
        varchar("trigger", { length: "80" }),
        new TableColumn({ name: "summary_json", type: "jsonb", isNullable: true }),
        timestamp("started_at", { nullable: true }),
        timestamp("completed_at", { nullable: true }),
        timestamp("created_at", { default: "now()" }),
        timestamp("updated_at", { default: "now()" }),
      ],
    }));
    await queryRunner.createIndex("fulcrum_connector_runs", new TableIndex({
      name: "fulcrum_connector_runs_org_connector_idx",
      columnNames: ["org_id", "connector_id"],
    }));
    await queryRunner.createIndex("fulcrum_connector_runs", new TableIndex({
      name: "fulcrum_connector_runs_org_status_idx",
      columnNames: ["org_id", "status"],
    }));
    await queryRunner.createIndex("fulcrum_connector_runs", new TableIndex({
      name: "fulcrum_connector_runs_created_idx",
      columnNames: ["created_at"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_connector_runs", true);
    await queryRunner.dropTable("fulcrum_connector_states", true);
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
