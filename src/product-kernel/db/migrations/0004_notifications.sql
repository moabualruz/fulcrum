-- Notification entities: rules, deliveries, quiet hours, webhook config, push subscriptions, mutes, retention.

CREATE TABLE IF NOT EXISTS notification_rules (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text,
  name text NOT NULL,
  event_pattern text NOT NULL,
  channels text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_rules_event_pattern_idx ON notification_rules (event_pattern);
CREATE INDEX IF NOT EXISTS notification_rules_scope_idx ON notification_rules (org_id, user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_id text NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  channel text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id, rule_id)
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (org_id, user_id, read, created_at);

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

CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications (org_id, user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'held-quiet-hours')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  retry_after timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx ON notification_deliveries (status, retry_after);

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'held-quiet-hours', 'suppressed'));
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS suppression_reason text;
ALTER TABLE notification_deliveries ALTER COLUMN notification_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS webhook_rule_configs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rule_id text NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  url text NOT NULL,
  encrypted_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS notification_quiet_hours (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  tz text NOT NULL DEFAULT 'UTC',
  start_hour integer NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  end_hour integer NOT NULL CHECK (end_hour >= 0 AND end_hour <= 23),
  days_of_week integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_mutes (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_kind, subject_id)
);

ALTER TABLE notification_mutes ADD COLUMN IF NOT EXISTS muted_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS notification_mutes_org_user_subject_idx
  ON notification_mutes (org_id, user_id, subject_kind, subject_id);

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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS event_retention_policies (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  retain_days integer NOT NULL DEFAULT 365,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);
