# Codex `invoke_team` Approval Mode

## What was changed

`config.toml` now sets `[tool_approval.invoke_team] approval_mode = "prompt"`.

When an agent running under Codex tries to call `invoke_team`, Codex's native confirmation UI
pops up before the call executes — the user must explicitly approve.

## Why

`invoke_team` is the highest-privilege action in Fulcrum (only `chief_of_staff` may call it,
and it spawns new sub-teams). Requiring explicit user confirmation prevents a rogue agent
from silently scaling out to additional workers.

## Fallback for older Codex builds

Codex builds that do not support per-tool `approval_mode` fall back to the PreToolUse hook
(`fulcrum hook codex`), which applies the team-invoke policy guard via `hooks.ts`
`checkInvokeTeamPolicy()`. This path blocks `invoke_team` unless the caller is verified
as `chief_of_staff` and the workspace policy permits team invocation.

## Manual verification

To verify the approval UI fires:
1. Load `~/.codex/config.toml` with the Fulcrum block merged in.
2. Ask Codex to call `invoke_team` via the MCP server.
3. Codex should display a confirmation prompt before the call proceeds.
