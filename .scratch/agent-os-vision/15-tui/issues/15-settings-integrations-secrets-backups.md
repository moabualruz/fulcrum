---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/14-settings-navigator-and-core-screens.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q-cross-cut, Q28, Q-flag-granularity]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Remaining settings screens: Integrations/Connectors (enabled connector cards, `s` sync, run log pane, `Enter` opens config form), Theme screen (ANSI preview panel, `n` next preset cycles 5 built-ins, custom CSS var inputs map to nearest ANSI 256 colour), Secrets screen (masked list via `credentials.*` tRPC, `a` add with masked input field, `d` delete with confirm), Backups screen (`b` backup → `backup.create` tRPC, path shown; restore form with confirm prompt), Doctor screen (all subsystem check rows from `doctor.run` tRPC; `Enter` opens recovery guide pane for warn/fail checks).

- **Web**: `/settings/integrations`, `/settings/theme`, `/settings/secrets`, `/settings/backups`, `/doctor` web routes.
- **CLI**: `fulcrum connectors list --json`, `fulcrum doctor --json`, `fulcrum backup --output`.
- **TUI**: primary surface for these settings screens.

## Acceptance criteria

- [ ] Connectors screen: enabled connectors shown with last-sync-at; `s` triggers sync → `connector_runs` row; run log shows last 10 runs.
- [ ] Theme screen: `n` cycles 5 presets; preview panel updates ANSI output; writes `tenant_settings`.
- [ ] Secrets screen: values masked (`****`); `a` adds with masked input (input chars show `*`); `d` confirms before delete.
- [ ] Backups screen: `b` runs backup progress bar; backup file path shown; restore form prompts "Confirm overwrite? [y/N]".
- [ ] Doctor screen: all subsystem check rows; green/yellow/red status icons; `Enter` shows recovery guide text; counts in footer (pass/warn/fail).
- [ ] After TUI connector `s` sync, CLI `fulcrum connectors runs <kind> --json` shows new `connector_runs` row.
- [ ] After TUI `b` backup, `fulcrum backup --output /tmp` file matches TUI-created backup file content.

## Blocked by

- 15/issues/14-settings-navigator-and-core-screens.md

## Notes

T15-61–T15-68 (remaining screens) maps to this slice.
