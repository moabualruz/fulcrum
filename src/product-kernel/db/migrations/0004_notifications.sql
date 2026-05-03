-- Notification system tables: rules, user notifications, deliveries, mutes, channels, quiet hours.

CREATE TABLE IF NOT EXISTS notification_rules (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_rules_org_idx ON notification_rules (org_id);

CREATE TABLE IF NOT EXISTS user_notifications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  verb text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications (org_id, user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_mutes (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, subject_kind, subject_id)
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);

CREATE TABLE IF NOT EXISTS notification_quiet_hours (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  start_hour integer NOT NULL CHECK (start_hour >= 0 AND start_hour < 24),
  end_hour integer NOT NULL CHECK (end_hour >= 0 AND end_hour < 24),
  timezone text NOT NULL DEFAULT 'UTC',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
