---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/06-task-detail-and-forms.md, 15/issues/07-sprints-and-reports.md, 15/issues/08-docs-tree-reader-editor.md, 15/issues/09-memory-and-context-preview.md, 15/issues/10-runs-and-artifacts.md, 15/issues/11-repos-browser.md, 15/issues/12-search-and-notifications.md, 15/issues/13-agents-orchestration-inference.md, 15/issues/15-settings-integrations-secrets-backups.md, 15/issues/16-gated-i18n-embeddings.md, 15/issues/17-gated-desktop-experiments-casbin-backups.md, 15/issues/18-doctor-integration-and-opentui-gate.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, A1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Final performance benchmarks and three-surface parity gate for Pillar 15. `hyperfine` measurements: cold TUI startup <500ms; screen navigation <50ms; VirtualList 1000 items <16ms/frame; search palette keypress → results <150ms. Cross-surface parity matrix: for each domain (tasks, docs, memory, runs, repos, artifacts, search, notifications, agents, orchestration, inference, settings), verify: web creates/reads/updates → CLI `--json` matches schema → TUI mutates via keyboard and reflects state. All 44 screens from screen inventory render without crash on FakeTTY. All keybindings actions reachable from keyboard on applicable screen. Live update latency: run log <100ms, bell badge <200ms, orchestration <200ms.

- **Web**: Playwright e2e for every domain; compared with TUI state.
- **CLI**: all domain `--json` commands match TUI tRPC output schema.
- **TUI**: FakeTTY snapshot suite covers all 44 always-on screens.

## Acceptance criteria

- [ ] All 44 screens from screen inventory render without crash on FakeTTY (0 crash failures).
- [ ] All `KeybindingAction` enum values reachable from keyboard on applicable screen (conflict detector passes).
- [ ] `hyperfine --warmup 3 'fulcrum tui exit-immediately'` cold startup <500ms.
- [ ] Screen navigation (in-process tRPC): 50 consecutive pane switches <50ms each (measured in synthetic test).
- [ ] VirtualList: 1000-item render <16ms/frame (OpenTUI frame timing or FakeTTY measurement).
- [ ] Parity matrix: 12 domains × 3 surfaces = 36 integration checks all green in `bun run ci`.
- [ ] Live updates: run log append latency <100ms; bell badge <200ms; orchestration state <200ms (FakeTTY + EventEmitter mock).
- [ ] `fulcrum doctor --json` tui subsystem: all 7 checks `ok` on healthy system; `keybind_conflicts` empty.

## Blocked by

- 15/issues/06-task-detail-and-forms.md
- 15/issues/07-sprints-and-reports.md
- 15/issues/08-docs-tree-reader-editor.md
- 15/issues/09-memory-and-context-preview.md
- 15/issues/10-runs-and-artifacts.md
- 15/issues/11-repos-browser.md
- 15/issues/12-search-and-notifications.md
- 15/issues/13-agents-orchestration-inference.md
- 15/issues/15-settings-integrations-secrets-backups.md
- 15/issues/16-gated-i18n-embeddings.md
- 15/issues/17-gated-desktop-experiments-casbin-backups.md
- 15/issues/18-doctor-integration-and-opentui-gate.md

## Notes

Pillar 15 marked done only after this gate passes. Maps to TUI acceptance criteria section of PRD 15.
