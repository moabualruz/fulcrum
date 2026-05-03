-- Saved searches: persisted query + filter combos with scope control.

CREATE TABLE IF NOT EXISTS saved_searches (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  user_id text NOT NULL,
  name text NOT NULL,
  query_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL CHECK (scope IN ('private', 'project', 'org')),
  project_id text REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_scope_idx ON saved_searches (org_id, user_id, scope);
