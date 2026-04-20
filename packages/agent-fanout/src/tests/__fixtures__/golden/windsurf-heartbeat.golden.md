---
description: Send regular heartbeats to keep long-running agent runs alive
trigger: model_decision
---
# Heartbeat

For any operation expected to take more than 5 minutes:

1. Call `fulcrum action exec heartbeat_agent_run` with `run_id` every 3–5 minutes.
2. Include a `status` message describing current progress (e.g. "running tests: 47/120 passing").
3. The Fulcrum janitor marks runs as stale after the `heartbeat_timeout_minutes` policy threshold (default: 10 min).

**Without heartbeats, the janitor will expire your run** and mark the task as blocked. Other agents may pick it up and duplicate work.

Minimal pattern:
```
every 3 minutes → fulcrum action exec heartbeat_agent_run(run_id, status="<current step>")
```
