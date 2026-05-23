import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * project_statuses — per-project workflow-position overrides used by the
 * web `projects/[id]/settings/statuses` route. Separate from `task_statuses`
 * (which scopes globally per workspace methodology); `project_statuses`
 * carries an `is_final` boolean per status row used for "closed" rollups.
 */
export class ProjectStatuses20260523001778932800000 implements MigrationInterface {
  name = "ProjectStatuses20260523001778932800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // No FK to legacy `projects` table — modern fulcrum_projects is the
    // canonical project store, and other workflow tables (tasks, sprints,
    // etc.) keep project_id as a soft varchar reference. Match that.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_statuses" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id" varchar NOT NULL,
        "name"       varchar NOT NULL,
        "color"      varchar NOT NULL DEFAULT '#6b7280',
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_final"   boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "project_statuses_project_name_unique" UNIQUE ("project_id", "name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "project_statuses_org_project_sort" ON "project_statuses" ("org_id", "project_id", "sort_order")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "project_statuses_org_project_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_statuses"`);
  }
}
