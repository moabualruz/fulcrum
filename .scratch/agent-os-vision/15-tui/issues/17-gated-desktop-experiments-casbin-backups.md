---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/14-settings-navigator-and-core-screens.md, 15/issues/15-settings-integrations-secrets-backups.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C1, Q-flag-granularity, Q-permissions, Q38, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Four remaining gated features in TUI:

**Desktop app Tauri keybind bridge** (`FULCRUM_FEATURES=desktop-app`): when ON, TUI running inside Tauri shell receives native OS keybindings via Tauri IPC bridge; no-op in standalone mode.

**Experiments panel** (`FULCRUM_FEATURES=experiments`): Settings → Experiments screen lists active experiments + assigned variant. OFF → screen hidden.

**Casbin ABAC permissions panel** (`FULCRUM_FEATURES=casbin-policies`): Settings → Permissions screen shows casbin rule editor (CRUD rule list, rule syntax preview). OFF → screen hidden.

**Scheduled backups** (`FULCRUM_FEATURES=scheduled-backups`): Backups screen gains cron schedule picker when ON; selection saves cron expression to `tenant_settings`. OFF → picker hidden.

- **Web**: each flag controls same feature surfaces in web settings.
- **CLI**: `fulcrum flags set <flag> on/off` controls each independently.
- **TUI**: primary surface.

## Acceptance criteria

- [x] desktop-app OFF → no Tauri IPC listener registered; ON → IPC listener registered; mock Tauri event → native shortcut received.
- [x] Experiments OFF → Settings → Experiments not in navigator; ON → experiment list with variant badges visible.
- [x] Casbin OFF → Settings → Permissions not in navigator; ON → rule CRUD editor renders; save → `casbin-policies` rule written.
- [x] Scheduled backups OFF → cron picker hidden in Backups screen; ON → cron picker renders; expression saves to `tenant_settings`.
- [x] All four flags independently controlled (toggling one does not affect others).
- [x] CLI `fulcrum flags set experiments on` → TUI Experiments panel becomes accessible.

## Blocked by

- 15/issues/14-settings-navigator-and-core-screens.md
- 15/issues/15-settings-integrations-secrets-backups.md

## Notes

T15-71–T15-74 maps to this slice.
