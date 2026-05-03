-- Users table for local auth. `handle` is unique per org (e.g. "admin@local").

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  handle text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, handle)
);
