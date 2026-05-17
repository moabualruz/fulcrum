import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_inbox_audit.sql",
  sql: "-- Saved searches (inbox_audit supplement — notifications table owned by 0004_notifications.sql)\n\nCREATE TABLE IF NOT EXISTS saved_searches (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  owner text NOT NULL,\n  name text NOT NULL,\n  params jsonb NOT NULL DEFAULT '{}'::jsonb,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (org_id, owner, name)\n);\n\nCREATE INDEX IF NOT EXISTS saved_searches_owner_idx\n  ON saved_searches (org_id, owner);\n",
};
