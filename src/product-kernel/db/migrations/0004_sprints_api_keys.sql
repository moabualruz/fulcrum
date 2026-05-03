-- Sprints, metrics cache, API keys, and task sprint assignment (P6#17, P6#21, P6#23).

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  capacity_points integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, status);

-- Nullable FK: tasks not yet assigned to a sprint have sprint_id = NULL.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_points integer;

CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON tasks (sprint_id) WHERE sprint_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS metrics_cache (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  sprint_id text NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  date date NOT NULL,
  points_remaining integer NOT NULL DEFAULT 0,
  points_completed integer NOT NULL DEFAULT 0,
  tasks_completed integer NOT NULL DEFAULT 0,
  wip_count integer NOT NULL DEFAULT 0,
  scope_change integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sprint_id, date)
);

CREATE INDEX IF NOT EXISTS metrics_cache_project_sprint_date ON metrics_cache (project_id, sprint_id, date);

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  user_id text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys (org_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
