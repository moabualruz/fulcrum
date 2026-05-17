import type { MigrationInterface, QueryRunner } from "typeorm";

export class IntegrationRepositories1778623200006 implements MigrationInterface {
  name = "IntegrationRepositories1778623200006";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_repositories (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL,
        project_id varchar(128),
        name varchar(240) NOT NULL,
        slug varchar(160) NOT NULL,
        kind varchar(32) NOT NULL,
        local_path text,
        remote_url text,
        default_branch varchar(160),
        current_branch varchar(160),
        last_sync_at timestamptz,
        sync_status varchar(80) NOT NULL DEFAULT 'idle',
        last_touched_at timestamptz,
        archived boolean NOT NULL DEFAULT false,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_repositories_org_slug_key UNIQUE (org_id, slug)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_repositories_org_archived_idx ON fulcrum_repositories (org_id, archived)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repositories_org_sync_idx ON fulcrum_repositories (org_id, sync_status)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repositories_trace_idx ON fulcrum_repositories (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_repository_branches (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL,
        repo_id varchar(128) NOT NULL REFERENCES fulcrum_repositories(id) ON DELETE CASCADE,
        name varchar(240) NOT NULL,
        head_sha varchar(80),
        is_current boolean NOT NULL DEFAULT false,
        is_default boolean NOT NULL DEFAULT false,
        source varchar(80),
        last_seen_at timestamptz,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_repository_branches_repo_name_key UNIQUE (repo_id, name)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_branches_org_repo_idx ON fulcrum_repository_branches (org_id, repo_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_branches_org_default_idx ON fulcrum_repository_branches (org_id, repo_id, is_default)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_branches_trace_idx ON fulcrum_repository_branches (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_repository_commits (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL,
        repo_id varchar(128) NOT NULL REFERENCES fulcrum_repositories(id) ON DELETE CASCADE,
        sha varchar(80) NOT NULL,
        branch varchar(240),
        message text NOT NULL,
        author_name varchar(240),
        author_email varchar(320),
        committed_at timestamptz NOT NULL,
        parent_shas text,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_repository_commits_repo_sha_key UNIQUE (repo_id, sha)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_commits_org_repo_idx ON fulcrum_repository_commits (org_id, repo_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_commits_repo_time_idx ON fulcrum_repository_commits (repo_id, committed_at DESC)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_repository_commits_trace_idx ON fulcrum_repository_commits (trace_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_repository_commits");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_repository_branches");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_repositories");
  }
}
