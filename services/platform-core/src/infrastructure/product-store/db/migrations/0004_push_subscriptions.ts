import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_push_subscriptions.sql",
  sql: "-- Push notification subscriptions for VAPID Web Push (P12#19).\n-- Gated behind FULCRUM_FEATURES=notify-push.\n\nCREATE TABLE IF NOT EXISTS push_subscriptions (\n  id text PRIMARY KEY,\n  org_id text NOT NULL REFERENCES orgs(id),\n  user_id text NOT NULL,\n  endpoint text NOT NULL,\n  p256dh text NOT NULL,\n  auth text NOT NULL,\n  user_agent text,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (user_id, endpoint)\n);\n\nCREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);\n",
};
