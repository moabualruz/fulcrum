---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 16-web-api-surfaces
---

# TUI agents pane + runs detail overlay

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Build the OpenTUI components for this pillar. **Agents pane**: profile table (`name`, `cliPath`, `last_tested_at`, `test_passed` badge); `t` key triggers `testProfile` mutation inline; `e` key opens profile edit overlay; `Enter` navigates to agent's run history. **Runs detail overlay**: triggered from runs list; tabs Summary | Transcript (auto-scroll live) | Diff | Artifacts; keys `l` transcript, `d` diff, `a` artifacts, `c` cancel, `r` retry, `Esc` back. **cmd-palette** entries: `> agents test <name>`, `> runs cancel <id>`, `> runs retry <id>`. All TUI components consume tRPC in-process (no separate HTTP hop).

## Acceptance criteria

- [ ] Adapter / profile: `<AgentsPane>` OpenTUI component renders profile table with all six profiles; `t` key calls `agents.testProfile` and updates badge in-place; `e` key opens overlay with editable fields (cli_path, default_flags, auth_env_vars); `Enter` opens run history for selected agent.
- [ ] Lifecycle integration: `<RunDetailOverlay>` shows Summary tab on open; `l`/`d`/`a` keys switch tabs; Transcript tab auto-scrolls to bottom on new lines during active run (polls `runs.getLogs` or uses SSE subscription); `c` calls `runs.cancel`, `r` calls `runs.retry`; `Esc` closes overlay.
- [ ] Surfaces parity: cancel/retry actions in TUI reflect in Web and CLI (all hit same tRPC procedures); `sandbox_mode` chip visible in runs list and Summary tab; `iteration_count` visible in Summary tab.
- [ ] Tests: TUI component render tests (headless OpenTUI test mode) — `<AgentsPane>` renders 6 rows; `t` keypress triggers `testProfile` mock; `<RunDetailOverlay>` tab switching works; `c` keypress triggers `cancel` mock.
- [ ] Tests: cmd-palette entries `> agents test <name>` and `> runs cancel <id>` resolve to correct tRPC mutations in integration test.

## Blocked by

16-web-api-surfaces

## Notes

OpenTUI failure gate (Q-tui-lib): if OpenTUI component library is too immature when this slice is picked up, evaluate ratatui (Rust) fallback and raise a question before proceeding — do not unilaterally switch. Transcript live-scroll: if SSE (`real-time-collab-server`) is off, poll `runs.getLogs` with cursor every 2s; terminate polling when run status is terminal. Profile edit overlay should call `agents.upsertProfile` mutation and re-fetch the profile on success.
