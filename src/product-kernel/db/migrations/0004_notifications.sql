-- Email notification channel: users table with email_verified, notification_deliveries table.

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  email_verify_token text,
  email_verify_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_org_idx ON users (org_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  user_id text NOT NULL REFERENCES users(id),
  channel text NOT NULL,
  notification_id text,
  subject text,
  body text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed')),
  suppression_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_user_channel_idx
  ON notification_deliveries (user_id, channel, created_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx
  ON notification_deliveries (status, created_at);
