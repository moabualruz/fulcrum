-- Agent profile registry: one row per supported agent CLI.

CREATE TABLE IF NOT EXISTS agent_profiles (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  name text NOT NULL,
  cli_path text NOT NULL,
  default_flags text NOT NULL DEFAULT '',
  auth_env_vars jsonb NOT NULL DEFAULT '[]'::jsonb,
  test_passed boolean,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
