# Copilot instructions — Fulcrum control plane

This repository uses [Fulcrum](https://github.com/moabualruz/pi-stack-plan) as its agent control plane. Copilot (Chat, Agent Mode, and cloud agents) MUST use the `fulcrum` CLI to record work, recall memory, and coordinate with other agents running in this workspace.

## Tool access — CLI-first

Every Fulcrum capability is reachable as a shell command. When Copilot runs in Agent Mode or as a cloud agent with bash access, it should invoke `fulcrum action exec <name>` rather than reimplementing the behaviour or skipping memory/lifecycle calls. Examples:

- `fulcrum action exec recall_memory --query "<question>" --limit 10`
- `fulcrum action exec write_memory --kind decision --content "…" --tags '["decision"]'`
- `fulcrum action exec start_agent_run --role software_engineer --task_id <id> --context_type primary`
- `fulcrum action exec heartbeat_agent_run --run_id <id> --progress_pct 40`
- `fulcrum action exec complete_agent_run --run_id <id> --output_summary "…"`

When MCP is enabled (`.mcp.json` in this directory), the same capabilities appear as `mcp__fulcrum__*` tools. Either path is fine — pick whichever the session supports.

## Lifecycle expectations

For any non-trivial task (more than a single-line change, or anything that touches memory / planning / policy):

1. **Start.** Open a run with `start_agent_run` passing an explicit `context_type` (`primary` if this is the top-level agent run; `subagent` if another agent invoked Copilot; `sidecar` for background helpers).
2. **Heartbeat.** For long work (> ~30 s), call `heartbeat_agent_run` periodically so the workspace dashboard does not mark the run stale.
3. **Recall before acting.** Before writing code that depends on prior decisions, call `recall_memory` with the relevant topic — saves re-learning the same thing the team already resolved.
4. **Record non-obvious decisions.** When you pick an approach over an alternative for a non-obvious reason, call `write_memory` with `kind=decision`.
5. **Close.** Always call `complete_agent_run` at the end with a one-line summary and the changed file paths.

## What NOT to do

- Do not write to `.fulcrum/` in this repo — Fulcrum's data lives under `globalDataDir()` (`$XDG_DATA_HOME/fulcrum` or `~/.local/share/fulcrum`). Writing here breaks the global-only-data invariant.
- Do not bypass sanitization. Memory writes go through the sanitize → WAL → L1 → L2 pipeline. The CLI handles this; direct SQL edits to `memories.db` will trip the divergence monitor.
- Do not invoke teams. Only `chief_of_staff` may run `invoke_team`. Copilot's default role is `software_engineer` (via `--profile software_engineer` in the MCP config).

## Further reading

- `agent-integration/copilot/.agents/skills/` — task-tracking, delegate-task, block-when-stuck, complete-agent-run, and other skills shared across hosts.
- `agent-integration/copilot/README.md` — install instructions.
- Upstream repo: `https://github.com/moabualruz/pi-stack-plan`
