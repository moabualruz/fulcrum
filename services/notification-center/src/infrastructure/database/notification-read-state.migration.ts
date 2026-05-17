import type { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationReadState1778750400000 implements MigrationInterface {
  name = "NotificationReadState1778750400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "user_notifications" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "org_id" uuid NOT NULL,
          "user_id" uuid NOT NULL,
          "rule_id" uuid,
          "event_id" uuid NOT NULL,
          "title" varchar(255) NOT NULL,
          "body" text NOT NULL DEFAULT '',
          "entity_kind" varchar(255) NOT NULL,
          "entity_id" uuid NOT NULL,
          "read_at" timestamptz,
          "trace_id" varchar(160),
          "created_at" timestamptz NOT NULL DEFAULT now()
        )
      `);
    } catch (error) {
      if (!isExistingRelationError(error)) throw error;
    }

    await addTraceColumnIfMissing(queryRunner);

    await queryRunner.query(`
      create unique index if not exists "uq_user_notifications_user_event_rule"
        on "user_notifications" ("user_id", "event_id", "rule_id") nulls not distinct
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_notifications_org_user_read"
        ON "user_notifications" ("org_id", "user_id", "read_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_notifications_org_user_created"
        ON "user_notifications" ("org_id", "user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_notifications_trace"
        ON "user_notifications" ("trace_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_notifications", true);
  }
}

async function addTraceColumnIfMissing(queryRunner: QueryRunner): Promise<void> {
  const rows = await queryRunner.query(`
    SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'user_notifications'
       AND a.attname = 'trace_id'
       AND NOT attisdropped
     LIMIT 1
  `) as unknown[];
  if (rows.length > 0) return;
  try {
    await queryRunner.query(`ALTER TABLE "user_notifications" ADD COLUMN "trace_id" varchar(160)`);
  } catch (error) {
    if (isDuplicateColumnError(error)) return;
    throw error;
  }
}

function isDuplicateColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string; constraint?: string } };
  return candidate.code === "23505"
    || candidate.driverError?.code === "23505"
    || candidate.driverError?.constraint === "pg_attribute_relid_attnam_index";
}

function isExistingRelationError(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } };
  return candidate.code === "42P07" || candidate.driverError?.code === "42P07";
}
