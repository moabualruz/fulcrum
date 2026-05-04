-- Saved searches (inbox_audit supplement — notifications table owned by 0004_notifications.sql)

CREATE TABLE IF NOT EXISTS saved_searches (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  owner text NOT NULL,
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, owner, name)
);

CREATE INDEX IF NOT EXISTS saved_searches_owner_idx
  ON saved_searches (org_id, owner);
