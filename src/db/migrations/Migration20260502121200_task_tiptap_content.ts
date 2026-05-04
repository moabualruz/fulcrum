import { Migration } from "@mikro-orm/migrations";

export class Migration20260502121200_task_tiptap_content extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `alter table "tasks" add column if not exists "tiptap_content" jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "tasks" drop column if exists "tiptap_content"`);
  }
}
