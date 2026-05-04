-- Users table for local auth. `handle` is unique per org (e.g. "admin@local").

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  handle text NOT NULL,
  display_name text,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  email_verify_token text,
  email_verify_token_expires_at timestamptz,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, handle)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at timestamptz;
