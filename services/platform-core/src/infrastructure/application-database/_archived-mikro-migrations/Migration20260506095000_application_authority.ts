import { Migration } from "@mikro-orm/migrations";

export class Migration20260506095000_application_authority extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`alter table "events" add column if not exists "project_id" uuid null`);
    this.addSql(`create index if not exists "events_scope_idx" on "events" ("org_id", "project_id", "created_at")`);

    this.addSql(`create table if not exists "bitbucket_pull_requests" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_slug" varchar(255) not null,
      "pull_request_id" varchar(255) not null,
      "title" varchar(255) not null,
      "state" varchar(255) not null,
      "url" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "bitbucket_pull_requests" add constraint "bitbucket_pull_requests_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "bitbucket_pull_requests_org_project" on "bitbucket_pull_requests" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "bitbucket_pull_requests_repo_external_unique" on "bitbucket_pull_requests" ("repo_slug", "pull_request_id")`);

    this.addSql(`create table if not exists "bitbucket_issues" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_slug" varchar(255) not null,
      "issue_id" varchar(255) not null,
      "title" varchar(255) not null,
      "state" varchar(255) not null,
      "url" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "bitbucket_issues" add constraint "bitbucket_issues_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "bitbucket_issues_org_project" on "bitbucket_issues" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "bitbucket_issues_repo_external_unique" on "bitbucket_issues" ("repo_slug", "issue_id")`);

    this.addSql(`create table if not exists "gitlab_merge_requests" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_path" varchar(255) not null,
      "merge_request_iid" varchar(255) not null,
      "title" varchar(255) not null,
      "state" varchar(255) not null,
      "url" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "gitlab_merge_requests" add constraint "gitlab_merge_requests_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "gitlab_merge_requests_org_project" on "gitlab_merge_requests" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "gitlab_merge_requests_repo_external_unique" on "gitlab_merge_requests" ("repo_path", "merge_request_iid")`);

    this.addSql(`create table if not exists "gitlab_issues" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_path" varchar(255) not null,
      "issue_iid" varchar(255) not null,
      "title" varchar(255) not null,
      "state" varchar(255) not null,
      "url" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "gitlab_issues" add constraint "gitlab_issues_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "gitlab_issues_org_project" on "gitlab_issues" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "gitlab_issues_repo_external_unique" on "gitlab_issues" ("repo_path", "issue_iid")`);

    this.addSql(`create table if not exists "github_connector_state" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "installation_id" varchar(255) not null,
      "repo_full_name" varchar(255) not null,
      "cursor" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "github_connector_state" add constraint "github_connector_state_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "github_connector_state_org_project" on "github_connector_state" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "github_connector_state_installation_repo_unique" on "github_connector_state" ("installation_id", "repo_full_name")`);

    this.addSql(`create table if not exists "repo_tree_entries" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_id" uuid not null,
      "commit_sha" varchar(255) not null,
      "path" text not null,
      "kind" varchar(255) not null,
      "size" bigint null,
      "content_hash" varchar(255) null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "repo_tree_entries" add constraint "repo_tree_entries_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`alter table "repo_tree_entries" add constraint "repo_tree_entries_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete cascade`);
    this.addSql(`create index if not exists "repo_tree_entries_org_project" on "repo_tree_entries" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "repo_tree_entries_repo_commit_path_unique" on "repo_tree_entries" ("repo_id", "commit_sha", "path")`);

    this.addSql(`create table if not exists "repo_blame_lines" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "repo_id" uuid not null,
      "path" text not null,
      "line_number" int not null,
      "commit_sha" varchar(255) not null,
      "author_name" varchar(255) not null,
      "author_email" varchar(255) null,
      "committed_at" timestamptz not null,
      "created_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "repo_blame_lines" add constraint "repo_blame_lines_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`alter table "repo_blame_lines" add constraint "repo_blame_lines_repo_id_foreign" foreign key ("repo_id") references "repos" ("id") on delete cascade`);
    this.addSql(`create index if not exists "repo_blame_lines_org_project" on "repo_blame_lines" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "repo_blame_lines_repo_path_line_unique" on "repo_blame_lines" ("repo_id", "path", "line_number")`);

    this.addSql(`create table if not exists "audit_events" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "actor_id" varchar(255) not null,
      "action" varchar(255) not null,
      "subject_kind" varchar(255) not null,
      "subject_id" varchar(255) not null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "audit_events" add constraint "audit_events_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "audit_events_org_project_created" on "audit_events" ("org_id", "project_id", "created_at" desc)`);
    this.addSql(`create index if not exists "audit_events_subject" on "audit_events" ("org_id", "subject_kind", "subject_id")`);

    this.addSql(`create table if not exists "audit_exports" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "requested_by_user_id" varchar(255) not null,
      "status" varchar(255) not null,
      "format" varchar(255) not null,
      "filters" jsonb not null default '{}',
      "download_url" varchar(255) null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "audit_exports" add constraint "audit_exports_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "audit_exports_org_project" on "audit_exports" ("org_id", "project_id")`);

    this.addSql(`create table if not exists "connector_credentials" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) not null,
      "provider" varchar(255) not null,
      "account_id" varchar(255) not null,
      "label" varchar(255) not null,
      "encrypted_secret" text not null,
      "metadata" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("id")
    )`);
    this.addSql(`alter table "connector_credentials" add constraint "connector_credentials_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "connector_credentials_org_project" on "connector_credentials" ("org_id", "project_id")`);
    this.addSql(`create unique index if not exists "connector_credentials_provider_account_unique" on "connector_credentials" ("org_id", "provider", "account_id")`);

    this.addSql(`create table if not exists "domain_event_outbox" (
      "id" uuid not null default gen_random_uuid(),
      "org_id" uuid not null,
      "project_id" varchar(255) null,
      "verb" varchar(255) not null,
      "subject_kind" varchar(255) not null,
      "subject_id" varchar(255) null,
      "event_key" varchar(255) not null,
      "payload" jsonb not null default '{}',
      "created_at" timestamptz not null default now(),
      "processed_at" timestamptz null,
      "attempts" int not null default 0,
      primary key ("id")
    )`);
    this.addSql(`alter table "domain_event_outbox" add constraint "domain_event_outbox_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index if not exists "domain_event_outbox_pending" on "domain_event_outbox" ("processed_at", "created_at") where "processed_at" is null`);
    this.addSql(`create unique index if not exists "domain_event_outbox_event_key_unique" on "domain_event_outbox" ("event_key")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "domain_event_outbox" cascade`);
    this.addSql(`drop table if exists "connector_credentials" cascade`);
    this.addSql(`drop table if exists "audit_exports" cascade`);
    this.addSql(`drop table if exists "audit_events" cascade`);
    this.addSql(`drop table if exists "repo_blame_lines" cascade`);
    this.addSql(`drop table if exists "repo_tree_entries" cascade`);
    this.addSql(`drop table if exists "github_connector_state" cascade`);
    this.addSql(`drop table if exists "gitlab_issues" cascade`);
    this.addSql(`drop table if exists "gitlab_merge_requests" cascade`);
    this.addSql(`drop table if exists "bitbucket_issues" cascade`);
    this.addSql(`drop table if exists "bitbucket_pull_requests" cascade`);
    this.addSql(`drop index if exists "events_scope_idx"`);
    this.addSql(`alter table "events" drop column if exists "project_id"`);
  }
}
