---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md, 17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md, 17-cross-cutting-platform/issues/03-backup-restore-trpc.md, 17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md, 17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md, 15-tui/issues/01-opentui-base-shell.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [Q-tui-lib, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (TUI parity)
Docs: https://kit.svelte.dev/docs
---

# TUI Settings screens — Theme, Secrets, Errors, Backup, Telemetry, Feature Flags, Data

## What to build

Seven TUI settings sub-tabs using OpenTUI (Bun-native TS). **Theme**: color approximation controls (ANSI 256-color closest match), slider controls, live theme applied to TUI borders immediately. **Secrets**: list with masked values; `A` add (prompt for name + value from stdin); `Enter` show value briefly (3s then re-mask); `R` rotate; `D` delete. **Errors**: scrollable crash list; `Enter` expand stack trace; `D` delete entry; `C` clear all. **Backup**: `B` create backup (progress indicator, streams bytes written); `R` restore (file path prompt + preflight summary modal); history list. **Telemetry**: toggle opt-in/out; `P` purge with count shown. **Feature Flags**: flag table; `Space` toggle enabled; `E` edit rollout %; `Enter` edit cohort rules (JSON editor overlay). **Data**: `E` export JSON (file path prompt + progress); `I` import JSON (file picker + preflight modal + confirm).

All tabs: `Tab`/`Shift+Tab` cycle sub-tabs; `Esc` returns to parent settings screen; keyboard help bar at bottom.

## Acceptance criteria

- [ ] Theme tab: accent change applies to focused borders in same TUI session; no re-launch required.
- [ ] Secrets tab: add → name+value prompted; list shows masked values; `Enter` unmasks for 3s; `D` deletes row from DB.
- [ ] Errors tab: scroll, expand, delete work; `C` clears all with confirmation.
- [ ] Backup tab: `B` → progress indicator shows KB written → completion message; restore flow shows preflight row counts.
- [ ] Telemetry tab: toggle persists; `P` shows count before and after (should be 0).
- [ ] Flags tab: `Space` toggles `enabled`; `E` prompts rollout %; change persists in DB.
- [ ] Data tab: export prompts path → file written; import prompts path → preflight → confirm → rows imported.
- [ ] Failure gate: OpenTUI too immature → ratatui pane in Rust sidecar via Unix socket; same keybindings documented.
- [ ] Vitest: each sub-tab renders correct data from mocked tRPC; keybinding actions fire correct procedures.

## Blocked by

- All prerequisite tRPC issues in this pillar.
- Pillar 15 issue 01 (OpenTUI base shell) — TUI runtime must exist.
