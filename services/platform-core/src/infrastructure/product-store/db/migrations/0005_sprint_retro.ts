import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0005_sprint_retro.sql",
  sql: "-- Sprint close + retro doc support.\n\nALTER TABLE sprints ADD COLUMN IF NOT EXISTS closed_at timestamptz;\nALTER TABLE sprints ADD COLUMN IF NOT EXISTS metrics_snapshot jsonb;\nALTER TABLE sprints ADD COLUMN IF NOT EXISTS retro_doc_id text;\n\n-- Dedup table for idempotent event handlers.\nCREATE TABLE IF NOT EXISTS event_handler_log (\n  event_id text NOT NULL,\n  handler text NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (event_id, handler)\n);\n",
};
