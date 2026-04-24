# Windmill Adapter Boundary

Capability: action/workflow orchestration.

Windmill may run human-triggered scripts, workflows, forms, schedules, webhooks, and
operator action logs. Fulcrum owns agent run lifecycle, task claiming, heartbeats,
policy gates, live stream, and canonical run status.

Validation gates:

- local deployment is acceptable for developer machines
- Windmill job IDs map to Fulcrum action refs
- failed Windmill jobs emit Fulcrum events
- Windmill does not own agent heartbeats or task claiming
