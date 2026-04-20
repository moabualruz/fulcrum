# Fulcrum agent instructions

<!-- BEGIN FULCRUM managed-block -->

This project uses the Fulcrum agent control plane. All agents — including
Copilot — must follow these rules:

## Always-on rules

1. **Start every task** — call `fulcrum action exec start_agent_run` before
   non-trivial work.
2. **Recall before writing** — call `fulcrum action exec recall_memory` before
   producing novel code or architectural decisions.
3. **Heartbeat on long tasks** — call `fulcrum action exec heartbeat_agent_run`
   every 3–5 min for tasks that take more than 5 min.
4. **Write decisions** — after a non-obvious choice, call
   `fulcrum action exec write_memory --kind decision`.
5. **Complete every run** — call `fulcrum action exec complete_agent_run` at
   the end with a summary and artifact paths.

## Data invariant

Fulcrum data lives in `globalDataDir()` (`$XDG_DATA_HOME/fulcrum` or
`~/.local/share/fulcrum`). Never write to `.fulcrum/` inside a project repo.

## Custom agents

See `.github/agents/` for the 24 canonical Fulcrum role definitions available
as named agents (`/agent chief_of_staff`, `/agent software_engineer`, etc.).

<!-- END FULCRUM managed-block -->
