import { Migration } from "@mikro-orm/migrations";

export class Migration20260506001 extends Migration {
  override async up(): Promise<void> {
    // SearchDocument expansion
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "title" varchar NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "body" text NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "labels" text[] NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "metadata" jsonb NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "project_id" varchar NULL`);
    this.addSql(`ALTER TABLE "search_documents" ADD COLUMN IF NOT EXISTS "status" varchar NULL`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "search_documents_fts" ON "search_documents" USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')))`);

    // Document title + context_summary
    this.addSql(`ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "title" varchar NULL`);
    this.addSql(`ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "context_summary" jsonb NULL`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "search_documents_fts"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "title"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "body"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "labels"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "metadata"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "updated_at"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "project_id"`);
    this.addSql(`ALTER TABLE "search_documents" DROP COLUMN IF EXISTS "status"`);
    this.addSql(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "title"`);
    this.addSql(`ALTER TABLE "documents" DROP COLUMN IF EXISTS "context_summary"`);
  }
}
