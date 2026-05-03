-- Agent profiles and run extensions for Web API surfaces (P4#16).

CREATE TABLE IF NOT EXISTS agent_profiles (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  name text NOT NULL,
  cli_path text NOT NULL,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  auth_env jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_passed boolean,
  tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS agent_profiles_org_idx ON agent_profiles (org_id);

-- Extend agent_runs with sandbox_mode, iteration_count, diff_path.
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS sandbox_mode text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS iteration_count integer DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS diff_path text;
