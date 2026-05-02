import { Migration } from "@mikro-orm/migrations";

export class Migration20260502101000_user_email_verified extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(
      `alter table "users" add column if not exists "email_verified" boolean not null default false`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop column if exists "email_verified"`);
  }
}
