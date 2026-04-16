---
name: fulcrum-session-start
description: Session orientation is handled automatically by the SessionStart hook — context is injected before your first turn
---

# Session Start — Automatic

Workspace context is injected automatically at session start via the Gemini `SessionStart` hook (`hooks/hooks.json`). The hook calls `fulcrum hook gemini session-start` which:

1. Starts a Fulcrum agent run and saves the `run_id`
2. Pre-fetches workspace status and queued tasks
3. Injects the snapshot as `additionalContext` before your first turn

You do **not** need to call `get_current_context` or `get_workspace_status` manually at startup — it has already been done.

If you need a fresh status check, use `/fulcrum-status` instead.
