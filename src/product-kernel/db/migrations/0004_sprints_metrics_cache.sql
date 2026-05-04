-- Sprints and metrics cache for reports (P6#02, P6#05).

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text NOT NULL CHECK (status IN ('planning', 'active', 'completed', 'cancelled')) DEFAULT 'planning',
  capacity_points integer NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, status);

CREATE TABLE IF NOT EXISTS metrics_cache (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  points_remaining integer NOT NULL DEFAULT 0,
  points_completed integer NOT NULL DEFAULT 0,
  tasks_completed integer NOT NULL DEFAULT 0,
  wip_count integer NOT NULL DEFAULT 0,
  scope_change integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sprint_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS metrics_cache_project_sprint_date ON metrics_cache (project_id, sprint_id, snapshot_date);
