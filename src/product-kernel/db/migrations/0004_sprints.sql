-- Sprint lifecycle tables: sprints, sprint_id FK on tasks, metrics_cache for velocity.

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  capacity integer NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, status);

-- Add sprint_id + estimate to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON tasks (sprint_id) WHERE sprint_id IS NOT NULL;

-- Metrics cache for velocity sparklines
CREATE TABLE IF NOT EXISTS metrics_cache (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  sprint_id text REFERENCES sprints(id),
  metric_key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sprint_id, metric_key)
);
