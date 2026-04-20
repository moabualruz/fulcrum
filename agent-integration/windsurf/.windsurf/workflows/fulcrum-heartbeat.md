---
name: fulcrum-heartbeat
description: Send a liveness heartbeat for long-running tasks to prevent stale run detection
---

For tasks taking more than 5 minutes, send periodic heartbeats:

`fulcrum action exec heartbeat_agent_run --run_id <run_id> --progress_pct <0-100> --current_step "<description>"`

Call every 3–5 minutes. A run without heartbeat for 10 minutes is marked stale.
