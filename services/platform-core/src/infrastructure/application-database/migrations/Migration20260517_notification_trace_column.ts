import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration20260517NotificationTraceColumn1778760600001 implements MigrationInterface {
  name = "Migration20260517NotificationTraceColumn1778760600001";
  transaction = false as const;

  async up(queryRunner: QueryRunner): Promise<void> {
    const tableRows = await queryRunner.query(`
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'user_notifications'
       LIMIT 1
    `) as unknown[];
    if (tableRows.length === 0) return;

    const columnRows = await queryRunner.query(`
      SELECT 1
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'user_notifications'
         AND a.attname = 'trace_id'
         AND NOT a.attisdropped
       LIMIT 1
    `) as unknown[];
    if (columnRows.length === 0) {
      try {
        await queryRunner.query(`ALTER TABLE "user_notifications" ADD COLUMN "trace_id" varchar(160)`);
      } catch (error) {
        if (!isDuplicateColumnError(error)) throw error;
      }
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_notifications_trace"
        ON "user_notifications" ("trace_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_notifications_trace"`);
    await queryRunner.query(`ALTER TABLE "user_notifications" DROP COLUMN IF EXISTS "trace_id"`);
  }
}

function isDuplicateColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string; constraint?: string } };
  return candidate.code === "23505"
    || candidate.driverError?.code === "23505"
    || candidate.driverError?.constraint === "pg_attribute_relid_attnam_index";
}
