-- Base product kernel schema. ULID text primary keys; timestamptz timestamps.

CREATE TABLE IF NOT EXISTS orgs (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS repos (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  slug text NOT NULL,
  root_path text NOT NULL,
  default_branch text,
  remote_url text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_scope_idx ON documents (org_id, project_id, kind);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  parent_id text REFERENCES tasks(id),
  title text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_scope_idx ON tasks (org_id, project_id, status);

CREATE TABLE IF NOT EXISTS memories (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  scope text NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  body text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, scope, key)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  task_id text REFERENCES tasks(id),
  agent text NOT NULL,
  model text,
  prompt text,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  exit_code integer,
  transcript_path text,
  total_tokens integer,
  cost_usd numeric,
  parent_run_id text REFERENCES agent_runs(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_runs_scope_idx ON agent_runs (org_id, project_id, status);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  run_id text REFERENCES agent_runs(id),
  task_id text REFERENCES tasks(id),
  kind text NOT NULL,
  title text NOT NULL,
  body_path text,
  sha256 text,
  size integer,
  mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edges (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  from_kind text NOT NULL,
  from_id text NOT NULL,
  to_kind text NOT NULL,
  to_id text NOT NULL,
  rel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_kind, from_id, to_kind, to_id, rel)
);

CREATE INDEX IF NOT EXISTS edges_from_idx ON edges (from_kind, from_id);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges (to_kind, to_id);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  actor text NOT NULL,
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  verb text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_subject_idx ON events (subject_kind, subject_id, created_at);
CREATE INDEX IF NOT EXISTS events_scope_idx ON events (org_id, project_id, created_at);
