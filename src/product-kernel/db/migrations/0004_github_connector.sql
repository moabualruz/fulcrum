-- GitHub connector: org_settings, github_prs, github_issues, repo_branches.
-- Gated behind FULCRUM_FEATURES=connector-github.

CREATE TABLE IF NOT EXISTS org_settings (
  org_id text PRIMARY KEY REFERENCES orgs(id),
  github_oauth_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_prs (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  org_id text NOT NULL REFERENCES orgs(id),
  number integer NOT NULL,
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
  UNIQUE (repo_id, number)
);

CREATE INDEX IF NOT EXISTS github_prs_repo_idx ON github_prs (repo_id, state);

CREATE TABLE IF NOT EXISTS github_issues (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  org_id text NOT NULL REFERENCES orgs(id),
  number integer NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  author text,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (repo_id, number)
);

CREATE INDEX IF NOT EXISTS github_issues_repo_idx ON github_issues (repo_id, state);

CREATE TABLE IF NOT EXISTS repo_branches (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repos(id),
  name text NOT NULL,
  sha text,
  is_pr_branch boolean NOT NULL DEFAULT false,
  pr_number integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, name)
);

CREATE INDEX IF NOT EXISTS repo_branches_repo_idx ON repo_branches (repo_id);
