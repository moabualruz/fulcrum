-- Sprint planning: sprints table + tasks.sprint_id FK.

CREATE TABLE IF NOT EXISTS sprints (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  capacity_points integer,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent: add columns that may be missing if a prior migration created
-- a minimal sprints table (e.g. 0004_connectors.sql).
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS status text DEFAULT 'planning';
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS capacity_points integer;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS end_date date;

CREATE INDEX IF NOT EXISTS sprints_project_idx ON sprints (project_id, status);

-- Nullable FK: tasks not yet assigned to a sprint have sprint_id = NULL.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text REFERENCES sprints(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_points integer;

CREATE INDEX IF NOT EXISTS tasks_sprint_idx ON tasks (sprint_id) WHERE sprint_id IS NOT NULL;
