import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableCheck, TableForeignKey, TableIndex } from "typeorm";

export class TaskRecurrence1778760600000 implements MigrationInterface {
  name = "TaskRecurrence1778760600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_task_recurrence_rules",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "source_task_id", type: "varchar", length: "128", isNullable: false },
          { name: "trigger_type", type: "varchar", length: "80", isNullable: false },
          { name: "cron_expression", type: "varchar", length: "255", isNullable: true },
          { name: "interval_days", type: "int", isNullable: true },
          { name: "timezone", type: "varchar", length: "80", isNullable: false, default: "'UTC'" },
          { name: "include_subtasks", type: "boolean", isNullable: false, default: false },
          { name: "max_occurrences", type: "int", isNullable: true },
          { name: "occurrences_created", type: "int", isNullable: false, default: 0 },
          { name: "enabled", type: "boolean", isNullable: false, default: true },
          { name: "template_data", type: "jsonb", isNullable: false, default: "'{}'::jsonb" },
          { name: "next_run_at", type: "timestamptz", isNullable: true },
          { name: "last_run_at", type: "timestamptz", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await createCheckIfMissing(queryRunner, "fulcrum_task_recurrence_rules", new TableCheck({
      name: "fulcrum_task_recurrence_rules_trigger_check",
      expression: "trigger_type in ('schedule', 'on_complete')",
    }));
    await createForeignKeyIfMissing(queryRunner, "fulcrum_task_recurrence_rules", new TableForeignKey({
      name: "fulcrum_task_recurrence_rules_org_fk",
      columnNames: ["org_id"],
      referencedTableName: "fulcrum_workspaces",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createForeignKeyIfMissing(queryRunner, "fulcrum_task_recurrence_rules", new TableForeignKey({
      name: "fulcrum_task_recurrence_rules_source_task_fk",
      columnNames: ["source_task_id"],
      referencedTableName: "fulcrum_tasks",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_task_recurrence_rules", new TableIndex({
      name: "fulcrum_task_recurrence_rules_org_task_idx",
      columnNames: ["org_id", "source_task_id"],
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_task_recurrence_rules", new TableIndex({
      name: "fulcrum_task_recurrence_rules_next_run_idx",
      columnNames: ["next_run_at", "enabled"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_task_recurrence_rules", true);
  }
}

async function createCheckIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  check: TableCheck,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.checks.some((candidate) => candidate.name === check.name)) return;
  await queryRunner.createCheckConstraint(tableName, check);
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
