import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0011_metrics_cache_report_columns.sql",
  sql: "-- Additive report-dashboard compatibility columns for isolated product stores.\n\nALTER TABLE metrics_cache\n  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'sprint',\n  ADD COLUMN IF NOT EXISTS points_total integer NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS tasks_total integer NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS started_count integer NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS completed_count integer NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS blocked_count integer NOT NULL DEFAULT 0,\n  ADD COLUMN IF NOT EXISTS status_counts jsonb NOT NULL DEFAULT '{}'::jsonb;\n\n",
};
