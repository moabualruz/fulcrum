import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Integration — creates connector/repo tables:
 *   repos, repo_branches, repo_commits, repo_blame_lines, repo_tree_entries,
 *   repo_files_index, github_connector_state, gitlab_issues,
 *   gitlab_merge_requests, bitbucket_issues, bitbucket_pull_requests,
 *   connector_sync_log, connector_credentials
 */
export class Integration1715788800004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // repos
    await queryRunner.query(`
      CREATE TABLE "repos" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"         uuid NOT NULL REFERENCES "orgs" ("id"),
        "name"           varchar NOT NULL,
        "slug"           varchar NOT NULL,
        "kind"           varchar NOT NULL,
        "local_path"     varchar,
        "remote_url"     varchar,
        "default_branch" varchar,
        "current_branch" varchar,
        "last_sync_at"   timestamptz,
        "sync_status"    varchar NOT NULL DEFAULT 'idle',
        "last_touched_at" timestamptz,
        "archived"       boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_repos_org_slug" ON "repos" ("org_id", "slug")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "repos_org_slug" ON "repos" ("org_id", "slug")`);
    await queryRunner.query(`CREATE INDEX "repos_org_touched" ON "repos" ("org_id", "last_touched_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "repos_kind_status" ON "repos" ("kind", "sync_status")`);

    // add FK from tasks to repos now that repos table exists
    await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "fk_tasks_repo_id" FOREIGN KEY ("repo_id") REFERENCES "repos" ("id") ON DELETE SET NULL`);

    // repo_branches
    await queryRunner.query(`
      CREATE TABLE "repo_branches" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id"),
        "repo_id"    uuid NOT NULL REFERENCES "repos" ("id") ON DELETE CASCADE,
        "name"       varchar NOT NULL,
        "sha"        varchar,
        "is_default" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "repo_branches_repo_name_unique" ON "repo_branches" ("repo_id", "name")`);
    await queryRunner.query(`CREATE INDEX "repo_branches_org_repo" ON "repo_branches" ("org_id", "repo_id")`);

    // repo_commits
    await queryRunner.query(`
      CREATE TABLE "repo_commits" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id"),
        "repo_id"      uuid NOT NULL REFERENCES "repos" ("id") ON DELETE CASCADE,
        "sha"          varchar NOT NULL,
        "message"      text,
        "author"       varchar,
        "committed_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "repo_commits_repo_sha_unique" ON "repo_commits" ("repo_id", "sha")`);
    await queryRunner.query(`CREATE INDEX "repo_commits_repo_committed_at" ON "repo_commits" ("repo_id", "committed_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "repo_commits_org_repo" ON "repo_commits" ("org_id", "repo_id")`);

    // repo_blame_lines
    await queryRunner.query(`
      CREATE TABLE "repo_blame_lines" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"   varchar NOT NULL,
        "repo_id"      uuid NOT NULL REFERENCES "repos" ("id") ON DELETE CASCADE,
        "path"         text NOT NULL,
        "line_number"  integer NOT NULL,
        "commit_sha"   varchar NOT NULL,
        "author_name"  varchar NOT NULL,
        "author_email" varchar,
        "committed_at" timestamptz NOT NULL,
        "created_at"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "repo_blame_lines_org_project" ON "repo_blame_lines" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "repo_blame_lines_repo_path_line_unique" ON "repo_blame_lines" ("repo_id", "path", "line_number")`);

    // repo_tree_entries
    await queryRunner.query(`
      CREATE TABLE "repo_tree_entries" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"   varchar NOT NULL,
        "repo_id"      uuid NOT NULL REFERENCES "repos" ("id") ON DELETE CASCADE,
        "commit_sha"   varchar NOT NULL,
        "path"         text NOT NULL,
        "kind"         varchar NOT NULL,
        "size"         bigint,
        "content_hash" varchar,
        "payload"      jsonb NOT NULL DEFAULT '{}',
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "repo_tree_entries_org_project" ON "repo_tree_entries" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "repo_tree_entries_repo_commit_path_unique" ON "repo_tree_entries" ("repo_id", "commit_sha", "path")`);

    // repo_files_index
    await queryRunner.query(`
      CREATE TABLE "repo_files_index" (
        "id"      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"  uuid NOT NULL REFERENCES "orgs" ("id"),
        "repo_id" uuid NOT NULL REFERENCES "repos" ("id") ON DELETE CASCADE,
        "path"    text NOT NULL,
        "kind"    varchar NOT NULL,
        "size"    bigint
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "repo_files_repo_path_unique" ON "repo_files_index" ("repo_id", "path")`);
    await queryRunner.query(`CREATE INDEX "repo_files_org_repo_kind" ON "repo_files_index" ("org_id", "repo_id", "kind")`);

    // github_connector_state
    await queryRunner.query(`
      CREATE TABLE "github_connector_state" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"       varchar NOT NULL,
        "installation_id"  varchar NOT NULL,
        "repo_full_name"   varchar NOT NULL,
        "cursor"           varchar,
        "payload"          jsonb NOT NULL DEFAULT '{}',
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "github_connector_state_org_project" ON "github_connector_state" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "github_connector_state_installation_repo_unique" ON "github_connector_state" ("installation_id", "repo_full_name")`);

    // gitlab_issues
    await queryRunner.query(`
      CREATE TABLE "gitlab_issues" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id" varchar NOT NULL,
        "repo_path"  varchar NOT NULL,
        "issue_iid"  varchar NOT NULL,
        "title"      varchar NOT NULL,
        "state"      varchar NOT NULL,
        "url"        varchar,
        "payload"    jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "gitlab_issues_org_project" ON "gitlab_issues" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "gitlab_issues_repo_external_unique" ON "gitlab_issues" ("repo_path", "issue_iid")`);

    // gitlab_merge_requests
    await queryRunner.query(`
      CREATE TABLE "gitlab_merge_requests" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"            uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"        varchar NOT NULL,
        "repo_path"         varchar NOT NULL,
        "merge_request_iid" varchar NOT NULL,
        "title"             varchar NOT NULL,
        "state"             varchar NOT NULL,
        "url"               varchar,
        "payload"           jsonb NOT NULL DEFAULT '{}',
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "gitlab_merge_requests_org_project" ON "gitlab_merge_requests" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "gitlab_merge_requests_repo_external_unique" ON "gitlab_merge_requests" ("repo_path", "merge_request_iid")`);

    // bitbucket_issues
    await queryRunner.query(`
      CREATE TABLE "bitbucket_issues" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"     uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id" varchar NOT NULL,
        "repo_slug"  varchar NOT NULL,
        "issue_id"   varchar NOT NULL,
        "title"      varchar NOT NULL,
        "state"      varchar NOT NULL,
        "url"        varchar,
        "payload"    jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "bitbucket_issues_org_project" ON "bitbucket_issues" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "bitbucket_issues_repo_external_unique" ON "bitbucket_issues" ("repo_slug", "issue_id")`);

    // bitbucket_pull_requests
    await queryRunner.query(`
      CREATE TABLE "bitbucket_pull_requests" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"      varchar NOT NULL,
        "repo_slug"       varchar NOT NULL,
        "pull_request_id" varchar NOT NULL,
        "title"           varchar NOT NULL,
        "state"           varchar NOT NULL,
        "url"             varchar,
        "payload"         jsonb NOT NULL DEFAULT '{}',
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "bitbucket_pull_requests_org_project" ON "bitbucket_pull_requests" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "bitbucket_pull_requests_repo_external_unique" ON "bitbucket_pull_requests" ("repo_slug", "pull_request_id")`);

    // connector_sync_log
    await queryRunner.query(`
      CREATE TABLE "connector_sync_log" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "connector"   varchar NOT NULL,
        "status"      varchar NOT NULL,
        "last_run_at" timestamptz NOT NULL DEFAULT now(),
        "error"       text
      )
    `);
    await queryRunner.query(`CREATE INDEX "connector_sync_log_org_connector" ON "connector_sync_log" ("org_id", "connector")`);

    // connector_credentials
    await queryRunner.query(`
      CREATE TABLE "connector_credentials" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"           uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"       varchar NOT NULL,
        "provider"         varchar NOT NULL,
        "account_id"       varchar NOT NULL,
        "label"            varchar NOT NULL,
        "encrypted_secret" text NOT NULL,
        "metadata"         jsonb NOT NULL DEFAULT '{}',
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "connector_credentials_org_project" ON "connector_credentials" ("org_id", "project_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "connector_credentials_provider_account_unique" ON "connector_credentials" ("org_id", "provider", "account_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_sync_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bitbucket_pull_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bitbucket_issues"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gitlab_merge_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gitlab_issues"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "github_connector_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_files_index"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_tree_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_blame_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_commits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repo_branches"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "fk_tasks_repo_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repos"`);
  }
}
