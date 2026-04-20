<!-- FULCRUM_PUBLIC_REPO_VARIANT — sanitized for public repositories.
     MCP host/monitor URLs and internal endpoint references are stripped.
     2026-04-24 Copilot privacy policy: interaction data from Free/Pro/Pro+ users
     on public repos trains models by default. This variant omits anything that
     would expose internal infrastructure URLs to Copilot's training pipeline. -->

# Copilot instructions — Fulcrum control plane

This repository uses Fulcrum as its agent control plane. Copilot MUST use the
`fulcrum` CLI to record work, recall memory, and coordinate with other agents.

## Tool access — CLI-first

Every Fulcrum capability is reachable as a shell command:

- `fulcrum action exec recall_memory --query "<question>" --limit 10`
- `fulcrum action exec write_memory --kind decision --content "…"`
- `fulcrum action exec start_agent_run --role software_engineer --task_id <id>`
- `fulcrum action exec heartbeat_agent_run --run_id <id> --progress_pct 40`
- `fulcrum action exec complete_agent_run --run_id <id> --output_summary "…"`

## Lifecycle expectations

1. **Start.** Call `start_agent_run` before any non-trivial work.
2. **Heartbeat.** Call `heartbeat_agent_run` every ~30 s on long tasks.
3. **Recall before acting.** Call `recall_memory` before writing novel code.
4. **Record decisions.** Call `write_memory --kind decision` for non-obvious choices.
5. **Close.** Always call `complete_agent_run` at the end.

## What NOT to do

- Do not write to `.fulcrum/` — Fulcrum data lives in `globalDataDir()`.
- Do not invoke teams. Only `chief_of_staff` may call `invoke_team`.
