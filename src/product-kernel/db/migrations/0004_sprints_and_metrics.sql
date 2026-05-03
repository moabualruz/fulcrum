-- Sprints and metrics cache for reports hub (Pillar 16, issue 08).

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('planning', 'active', 'completed', 'cancelled')) DEFAULT 'planning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sprints_scope_idx ON sprints (org_id, project_id, status);

-- Add sprint_id and story_points to tasks (nullable — not all tasks belong to sprints).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS story_points integer;

CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON tasks (sprint_id);

-- Daily metrics snapshots for burndown / WIP / CFD charts.
CREATE TABLE IF NOT EXISTS metrics_cache (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  sprint_id text REFERENCES sprints(id),
  snapshot_date date NOT NULL,
  metric_kind text NOT NULL CHECK (metric_kind IN ('burndown', 'wip', 'cfd')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id, sprint_id, snapshot_date, metric_kind)
);

CREATE INDEX IF NOT EXISTS metrics_cache_lookup_idx ON metrics_cache (project_id, sprint_id, metric_kind, snapshot_date);
