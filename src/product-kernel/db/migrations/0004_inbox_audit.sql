-- Notifications inbox + saved searches + audit helpers

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  recipient text NOT NULL,
  event_id text REFERENCES events(id),
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  verb text NOT NULL,
  actor text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (org_id, recipient, read_at, created_at DESC);

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
