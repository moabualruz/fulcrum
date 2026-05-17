import type { MigrationInterface, QueryRunner } from "typeorm";

export class JobQueue1778751000000 implements MigrationInterface {
  name = "JobQueue1778751000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_jobs (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        queue varchar(120) NOT NULL,
        kind varchar(120) NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(40) NOT NULL DEFAULT 'queued',
        attempts int NOT NULL DEFAULT 0,
        max_attempts int NOT NULL DEFAULT 3,
        available_at timestamptz NOT NULL DEFAULT now(),
        locked_by varchar(160),
        locked_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_jobs_status_check
          CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_jobs_claim_idx ON fulcrum_jobs (queue, status, available_at, created_at)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_jobs_scope_idx ON fulcrum_jobs (org_id, project_id, status)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_jobs_kind_idx ON fulcrum_jobs (queue, kind)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_jobs");
  }
}
