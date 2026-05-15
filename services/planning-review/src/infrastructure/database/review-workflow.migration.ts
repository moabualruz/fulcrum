import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReviewWorkflow1778623200002 implements MigrationInterface {
  name = "ReviewWorkflow1778623200002";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_artifacts (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        run_id varchar(128),
        task_id varchar(128),
        doc_id varchar(128),
        kind varchar(80) NOT NULL,
        title varchar(320) NOT NULL,
        filename varchar(320),
        body_path text,
        checksum_sha256 varchar(96),
        mime varchar(160),
        size_bytes bigint NOT NULL DEFAULT 0,
        lifecycle_state varchar(80) NOT NULL DEFAULT 'created',
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        archived boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_artifacts_project_kind_idx ON fulcrum_artifacts (project_id, kind)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_artifacts_project_lifecycle_idx ON fulcrum_artifacts (project_id, lifecycle_state)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_artifacts_trace_idx ON fulcrum_artifacts (trace_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_artifacts_archive_idx ON fulcrum_artifacts (project_id, archived)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_plans (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        title varchar(320) NOT NULL,
        plan_md text NOT NULL,
        status varchar(80) NOT NULL,
        source_doc_id varchar(128) REFERENCES fulcrum_documents(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_plans_project_status_idx ON fulcrum_plans (project_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_plan_prototypes (
        id varchar(128) PRIMARY KEY,
        plan_id varchar(128) NOT NULL REFERENCES fulcrum_plans(id) ON DELETE CASCADE,
        artifact_id varchar(128) REFERENCES fulcrum_artifacts(id) ON DELETE SET NULL,
        kind varchar(80) NOT NULL,
        title varchar(320) NOT NULL,
        status varchar(80) NOT NULL,
        output_ref text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_plan_prototypes_plan_status_idx ON fulcrum_plan_prototypes (plan_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_review_sessions (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        review_type varchar(80) NOT NULL,
        subject_id varchar(128) NOT NULL,
        status varchar(80) NOT NULL,
        revision integer NOT NULL,
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_review_sessions_project_type_idx ON fulcrum_review_sessions (project_id, review_type)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_review_sessions_trace_idx ON fulcrum_review_sessions (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_review_annotations (
        id varchar(128) PRIMARY KEY,
        review_session_id varchar(128) NOT NULL REFERENCES fulcrum_review_sessions(id) ON DELETE CASCADE,
        file_path text NOT NULL,
        line_start integer NOT NULL,
        line_end integer NOT NULL,
        severity varchar(80) NOT NULL,
        body text NOT NULL,
        status varchar(80) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_review_annotations_session_status_idx ON fulcrum_review_annotations (review_session_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_uat_sessions (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        status varchar(80) NOT NULL,
        final_qa_event_id varchar(128),
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_uat_sessions_project_status_idx ON fulcrum_uat_sessions (project_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_generated_e2e_tests (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        source_uat_session_id varchar(128) NOT NULL REFERENCES fulcrum_uat_sessions(id) ON DELETE CASCADE,
        runner varchar(80) NOT NULL,
        file_path text NOT NULL,
        status varchar(80) NOT NULL,
        body_md text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_generated_e2e_tests_project_status_idx ON fulcrum_generated_e2e_tests (project_id, status)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_generated_e2e_tests");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_uat_sessions");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_review_annotations");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_review_sessions");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_plan_prototypes");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_plans");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_artifacts");
  }
}
