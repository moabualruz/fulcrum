-- Orchestration: workflow definitions + orchestration config

CREATE TABLE IF NOT EXISTS workflow_defs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  name text NOT NULL,
  description text,
  yaml_config text NOT NULL DEFAULT '',
  prompt_template text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_defs_scope_idx ON workflow_defs (org_id, project_id);

CREATE TABLE IF NOT EXISTS orchestration_config (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) UNIQUE,
  poll_interval_s integer NOT NULL DEFAULT 5,
  max_concurrency integer NOT NULL DEFAULT 4,
  stall_timeout_s integer NOT NULL DEFAULT 300,
  workspace_root text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add symphony_state to agent_runs for orchestration state machine tracking
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS symphony_state text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_error_kind text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS workspace_path text;
