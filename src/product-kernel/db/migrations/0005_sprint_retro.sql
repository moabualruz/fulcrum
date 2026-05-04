-- Sprint close + retro doc support.

ALTER TABLE sprints ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS metrics_snapshot jsonb;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS retro_doc_id text;

-- Dedup table for idempotent event handlers.
CREATE TABLE IF NOT EXISTS event_handler_log (
  event_id text NOT NULL,
  handler text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, handler)
);
