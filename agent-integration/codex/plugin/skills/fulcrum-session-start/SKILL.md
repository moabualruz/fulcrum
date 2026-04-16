---
name: fulcrum-session-start
description: Session orientation is handled automatically by the SessionStart hook — context is injected before your first turn
---

# Session Start — Automatic

Workspace context is injected automatically at session start via the Codex `SessionStart` hook (`~/.codex/config.toml`). The hook calls `fulcrum hook codex session-start` which:

1. Starts a Fulcrum agent run and saves the `run_id`
2. Pre-fetches workspace status and queued tasks
3. Injects the snapshot as `additional_context` before your first turn

You do **not** need to call context commands manually at startup.

If you need a fresh status check, run:

```bash
fulcrum action exec get_workspace_status
```
