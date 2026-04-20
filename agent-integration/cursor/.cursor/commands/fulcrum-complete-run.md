---
name: fulcrum-complete-run
description: Mark the current Fulcrum agent run as complete with a summary
---

Close the agent run registered at session start:

`fulcrum action exec complete_agent_run --run_id <run_id> --output_summary "<one-line summary>" --artifact_paths '["<path1>","<path2>"]'`

Always call this at the end of a task session.
