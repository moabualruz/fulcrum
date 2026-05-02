-- Retry/backoff and stall-scan columns for product-kernel run views.

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS orchestration_state text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_error_kind text;

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_orchestration_state_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_orchestration_state_check
  CHECK (orchestration_state IN (
    'unclaimed',
    'claimed',
    'running',
    'retry_queued',
    'released',
    'succeeded',
    'failed',
    'timed_out',
    'stalled',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS agent_runs_dispatch_poll
  ON agent_runs (org_id, orchestration_state, next_retry_at)
  WHERE orchestration_state IN ('unclaimed', 'retry_queued');

CREATE INDEX IF NOT EXISTS agent_runs_stall_scan
  ON agent_runs (org_id, orchestration_state, started_at)
  WHERE orchestration_state = 'running';
