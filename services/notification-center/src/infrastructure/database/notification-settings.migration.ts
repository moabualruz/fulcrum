import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableColumn, TableIndex, TableUnique } from "typeorm";

export class NotificationSettings1778750500000 implements MigrationInterface {
  name = "NotificationSettings1778750500000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "notification_rules",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: true },
          { name: "subject_kind", type: "varchar", length: "255", isNullable: true },
          { name: "active", type: "boolean", isNullable: false, default: true },
          { name: "name", type: "varchar", length: "255", isNullable: true },
          { name: "event_pattern", type: "jsonb", isNullable: true },
          { name: "channels", type: "text", isArray: true, isNullable: true },
          { name: "enabled", type: "boolean", isNullable: false, default: true },
          { name: "created_at", type: "timestamptz", isNullable: true },
          { name: "updated_at", type: "timestamptz", isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "notification_quiet_hours",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "tz", type: "varchar", length: "255", isNullable: false, default: "'UTC'" },
          { name: "start_hour", type: "integer", isNullable: false },
          { name: "end_hour", type: "integer", isNullable: false },
          { name: "days_of_week", type: "integer", isArray: true, isNullable: false, default: "'{0,1,2,3,4,5,6}'" },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "push_subscriptions",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "endpoint", type: "text", isNullable: false },
          { name: "p256dh", type: "text", isNullable: false },
          { name: "auth", type: "text", isNullable: false },
          { name: "user_agent", type: "text", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "notification_mutes",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "subject_kind", type: "varchar", length: "255", isNullable: false },
          { name: "subject_id", type: "varchar", length: "255", isNullable: false },
          { name: "muted_until", type: "timestamptz", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await queryRunner.createTable(
      new Table({
        name: "notification_channels",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, default: "gen_random_uuid()" },
          { name: "org_id", type: "uuid", isNullable: false },
          { name: "user_id", type: "uuid", isNullable: true },
          { name: "kind", type: "varchar", length: "64", isNullable: false },
          { name: "enabled", type: "boolean", isNullable: false, default: true },
          { name: "config", type: "jsonb", isNullable: false, default: "'{}'::jsonb" },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await addColumnIfMissing(queryRunner, "notification_channels", new TableColumn({
      name: "user_id",
      type: "uuid",
      isNullable: true,
    }));

    // Align legacy notification_quiet_hours columns from Notifications1715788800005 with the entity:
    //   timezone -> tz; days_of_week text CSV -> integer[]; add created_at/updated_at.
    await queryRunner.query(`
      do $$ begin
        if exists (select 1 from information_schema.columns
                   where table_name = 'notification_quiet_hours' and column_name = 'timezone')
           and not exists (select 1 from information_schema.columns
                           where table_name = 'notification_quiet_hours' and column_name = 'tz') then
          alter table "notification_quiet_hours" rename column "timezone" to "tz";
        end if;
      end $$;
    `);
    await queryRunner.query(`
      do $$ begin
        if exists (select 1 from information_schema.columns
                   where table_name = 'notification_quiet_hours' and column_name = 'days_of_week'
                     and data_type = 'text') then
          alter table "notification_quiet_hours"
            alter column "days_of_week" drop default,
            alter column "days_of_week" type integer[] using
              case when "days_of_week" is null or "days_of_week" = '' then ARRAY[]::integer[]
                   else string_to_array("days_of_week", ',')::integer[] end,
            alter column "days_of_week" set default ARRAY[0,1,2,3,4,5,6];
        end if;
      end $$;
    `);
    await addColumnIfMissing(queryRunner, "notification_quiet_hours", new TableColumn({
      name: "created_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));
    await addColumnIfMissing(queryRunner, "notification_quiet_hours", new TableColumn({
      name: "updated_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));
    await addColumnIfMissing(queryRunner, "notification_mutes", new TableColumn({
      name: "created_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));
    await addColumnIfMissing(queryRunner, "notification_mutes", new TableColumn({
      name: "updated_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));
    await addColumnIfMissing(queryRunner, "push_subscriptions", new TableColumn({
      name: "created_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));
    await addColumnIfMissing(queryRunner, "push_subscriptions", new TableColumn({
      name: "updated_at",
      type: "timestamptz",
      isNullable: false,
      default: "now()",
    }));

    await createIndexIfMissing(queryRunner, "notification_rules", new TableIndex({
      name: "notification_rules_org_user",
      columnNames: ["org_id", "user_id"],
    }));
    await createIndexIfMissing(queryRunner, "notification_rules", new TableIndex({
      name: "notification_rules_org_enabled",
      columnNames: ["org_id", "enabled"],
    }));
    await queryRunner.query(`
      create unique index if not exists "uq_notification_rules_user_name"
        on "notification_rules" ("user_id", "name") nulls not distinct
    `);
    await queryRunner.query(`
      create unique index if not exists "uq_notification_quiet_hours_user"
        on "notification_quiet_hours" ("user_id")
    `);
    await queryRunner.query(`
      create unique index if not exists "uq_push_subscriptions_user_endpoint"
        on "push_subscriptions" ("user_id", "endpoint")
    `);
    await createIndexIfMissing(queryRunner, "notification_mutes", new TableIndex({
      name: "idx_notification_mutes_org_user",
      columnNames: ["org_id", "user_id"],
    }));
    await createUniqueIfMissing(queryRunner, "notification_mutes", new TableUnique({
      name: "uq_notification_mutes_org_user_subject",
      columnNames: ["org_id", "user_id", "subject_kind", "subject_id"],
    }));
    await createIndexIfMissing(queryRunner, "notification_channels", new TableIndex({
      name: "idx_notification_channels_org_user",
      columnNames: ["org_id", "user_id"],
    }));
    await queryRunner.query(`
      create unique index if not exists "uq_notification_channels_org_user_kind"
        on "notification_channels" ("org_id", "user_id", "kind") nulls not distinct
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("notification_channels", true);
    await queryRunner.dropTable("notification_mutes", true);
    await queryRunner.dropTable("push_subscriptions", true);
    await queryRunner.dropTable("notification_quiet_hours", true);
    await queryRunner.dropTable("notification_rules", true);
  }
}

async function addColumnIfMissing(queryRunner: QueryRunner, tableName: string, column: TableColumn): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.columns.some((candidate) => candidate.name === column.name)) return;
  await queryRunner.addColumn(tableName, column);
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
