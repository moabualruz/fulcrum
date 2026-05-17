import { Migration } from "@mikro-orm/migrations";

export class Migration20260502121100_task_dependencies_index extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create index "tasks_dependencies_gin" on "tasks" using gin ("dependencies")`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "tasks_dependencies_gin"`);
  }
}
