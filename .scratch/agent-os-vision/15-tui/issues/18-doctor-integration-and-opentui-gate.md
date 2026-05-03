---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/01-tui-foundation-launcher.md, 15/issues/02-global-widgets.md, 15/issues/03-theme-engine.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [A2, Q-tui-lib, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Doctor integration for TUI subsystem + OpenTUI immaturity gate test. Doctor check module `src/doctor/checks/tui.ts` with 7 checks: binary compiled with TUI entrypoint, OpenTUI version API-compatible, p95 render time <50ms from `local_telemetry` last 7d, no keybind conflicts (conflict detector runs on current schema + user overrides), tRPC `createCaller` warmup resolves, EventEmitter subscription bridge emits within 200ms, wcwidth returns 2 for CJK sample (U+4E2D). OpenTUI immaturity gate (T15-75): snapshot suite runs against `FakeTTY`; if >10 screens fail snapshot due to OpenTUI API breakage → CI gate fails + migration script to ratatui documented in `HANDOVER.md`.

- **Web**: Doctor `/doctor` web page shows TUI subsystem row.
- **CLI**: `fulcrum doctor --subsystem tui --json` returns `TuiDoctorCheck` Zod shape.
- **TUI**: Doctor screen (slice 15) renders TUI subsystem checks.

## Acceptance criteria

- [ ] 7 doctor checks registered in `tui` subsystem; `fulcrum doctor --subsystem tui --json` returns all 7.
- [ ] `tui.render_p95_ms`: from `local_telemetry`; pass <50ms, warn 50–200ms, fail >200ms.
- [ ] `tui.keybind_conflicts`: default bindings → empty `conflicts` array.
- [ ] `tui.wcwidth_cjk`: `wcwidth('中')` = 2 → pass; returns fail + recovery if wrong.
- [ ] `tui.subscription_bridge`: mock EventEmitter emit → callback within 200ms → pass.
- [ ] OpenTUI gate: `FakeTTY` snapshot suite counts failures; >10 screen snapshot failures → CI exits non-zero; message includes ratatui migration instructions path.
- [ ] `TuiDoctorCheck` Zod schema valid; CLI `--subsystem tui`, TUI Doctor screen, web Doctor page all show same 7 checks.

## Blocked by

- 15/issues/01-tui-foundation-launcher.md
- 15/issues/02-global-widgets.md
- 15/issues/03-theme-engine.md

## Notes

T15-75 (OpenTUI gate) maps to this slice alongside T15 doctor checks.
