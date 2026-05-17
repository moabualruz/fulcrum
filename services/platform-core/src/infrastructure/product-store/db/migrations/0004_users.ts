import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_users.sql",
  sql: "-- Users table for local auth. `handle` is unique per org (e.g. \"admin@local\").\n\nCREATE TABLE IF NOT EXISTS users (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  handle text NOT NULL,\n  display_name text,\n  email text,\n  email_verified boolean NOT NULL DEFAULT false,\n  email_verify_token text,\n  email_verify_token_expires_at timestamptz,\n  role text NOT NULL DEFAULT 'admin',\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, handle)\n);\n\nALTER TABLE users ADD COLUMN IF NOT EXISTS email text;\nALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;\nALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token text;\nALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at timestamptz;\n",
};
