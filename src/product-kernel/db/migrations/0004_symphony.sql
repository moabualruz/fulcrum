-- Symphony orchestration: workflow definitions and symphony runs.

CREATE TABLE IF NOT EXISTS workflow_defs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  prompt_template text,
  hooks jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS symphony_runs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  workflow_def_id text REFERENCES workflow_defs(id),
  identifier text NOT NULL,
  symphony_state text NOT NULL CHECK (symphony_state IN (
    'pending', 'running', 'succeeded', 'failed', 'cancelled', 'retry_queued'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  next_retry_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS symphony_runs_org_state_idx ON symphony_runs (org_id, symphony_state);
CREATE INDEX IF NOT EXISTS symphony_runs_identifier_idx ON symphony_runs (identifier);
