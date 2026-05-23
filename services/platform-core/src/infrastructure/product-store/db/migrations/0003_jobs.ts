import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0003_jobs.sql",
  sql: "-- Local queue for agent runs and background jobs.\n\nCREATE TABLE IF NOT EXISTS jobs (\n  id text PRIMARY KEY,\n  org_id text NOT NULL,\n  project_id text,\n  trace_id text,\n  queue text NOT NULL,\n  kind text NOT NULL,\n  payload jsonb NOT NULL DEFAULT '{}'::jsonb,\n  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),\n  attempts integer NOT NULL DEFAULT 0,\n  max_attempts integer NOT NULL DEFAULT 3,\n  available_at timestamptz NOT NULL DEFAULT now(),\n  locked_by text,\n  locked_at timestamptz,\n  last_error text,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  updated_at timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (queue, status, available_at, created_at);\nCREATE INDEX IF NOT EXISTS jobs_trace_idx ON jobs (trace_id);\n",
};
