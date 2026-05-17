import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowAudit1778623200008 implements MigrationInterface {
  name = "WorkflowAudit1778623200008";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_audit_events (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL,
        project_id varchar(128),
        user_id varchar(128),
        verb varchar(160) NOT NULL,
        subject_kind varchar(80) NOT NULL,
        subject_id varchar(128),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        trace_id varchar(160),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_audit_events_org_created_idx ON fulcrum_audit_events (org_id, created_at)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_audit_events_org_project_idx ON fulcrum_audit_events (org_id, project_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_audit_events_org_subject_idx ON fulcrum_audit_events (org_id, subject_kind)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_audit_events_org_verb_idx ON fulcrum_audit_events (org_id, verb)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_audit_events_trace_idx ON fulcrum_audit_events (trace_id)",
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_retention_policy (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL,
        project_id varchar(128),
        retain_days integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX IF NOT EXISTS event_retention_policy_org_idx ON event_retention_policy (org_id)",
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_event_retention_policy_org_project
        ON event_retention_policy (org_id, project_id) NULLS NOT DISTINCT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS event_retention_policy");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_audit_events");
  }
}
