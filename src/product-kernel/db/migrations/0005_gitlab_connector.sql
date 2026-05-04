-- GitLab connector: gitlab_mrs, gitlab_issues tables + org_settings columns.
-- Gated behind FULCRUM_FEATURES=connector-gitlab.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS gitlab_pat text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS gitlab_oauth_token text;

CREATE TABLE IF NOT EXISTS gitlab_mrs (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  org_id text NOT NULL REFERENCES orgs(id),
  mr_iid integer NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  author text,
  head_sha text,
  base_branch text,
  head_branch text,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz,
  UNIQUE (repo_id, mr_iid)
);

CREATE INDEX IF NOT EXISTS gitlab_mrs_repo_idx ON gitlab_mrs (repo_id, state);

CREATE TABLE IF NOT EXISTS gitlab_issues (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  org_id text NOT NULL REFERENCES orgs(id),
  issue_iid integer NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  author text,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (repo_id, issue_iid)
);

CREATE INDEX IF NOT EXISTS gitlab_issues_repo_idx ON gitlab_issues (repo_id, state);
