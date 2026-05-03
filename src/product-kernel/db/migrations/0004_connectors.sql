-- Connector framework: external_id on tasks, sprints, labels, connector_sync_log.

-- Add external_id to tasks for connector upsert keying.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_org_external_id
  ON tasks (org_id, external_id) WHERE external_id IS NOT NULL;

-- Add assignee column to tasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee text;

-- Sprints table for milestone/sprint mapping.
CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  title text NOT NULL,
  start_date timestamptz,
  end_date timestamptz,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sprints_org_external_id
  ON sprints (org_id, external_id) WHERE external_id IS NOT NULL;

-- Add sprint_id FK to tasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id) ON DELETE SET NULL;

-- Labels table.
CREATE TABLE IF NOT EXISTS labels (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id, name)
);

-- Task-label junction.
CREATE TABLE IF NOT EXISTS task_labels (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id text NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- Connector sync log.
CREATE TABLE IF NOT EXISTS connector_sync_log (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  connector text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  items_imported integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS status text;
UPDATE connector_sync_log SET status = 'succeeded' WHERE status IS NULL;
ALTER TABLE connector_sync_log ALTER COLUMN status SET NOT NULL;
ALTER TABLE connector_sync_log DROP CONSTRAINT IF EXISTS connector_sync_log_status_check;
ALTER TABLE connector_sync_log ADD CONSTRAINT connector_sync_log_status_check
  CHECK (status IN ('running', 'succeeded', 'failed'));
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS items_imported integer NOT NULL DEFAULT 0;
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS items_updated integer NOT NULL DEFAULT 0;
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS errors integer NOT NULL DEFAULT 0;
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS last_run_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS connector_sync_log_org_connector
  ON connector_sync_log (org_id, connector);
