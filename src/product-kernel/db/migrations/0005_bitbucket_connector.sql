-- Bitbucket connector: bb_prs, bb_issues, org_settings columns.
-- Gated behind FULCRUM_FEATURES=connector-bitbucket.

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS bitbucket_app_password text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS bitbucket_oauth_token text;

CREATE TABLE IF NOT EXISTS bb_prs (
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

CREATE INDEX IF NOT EXISTS bb_prs_repo_idx ON bb_prs (repo_id, state);

CREATE TABLE IF NOT EXISTS bb_issues (
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

CREATE INDEX IF NOT EXISTS bb_issues_repo_idx ON bb_issues (repo_id, state);
