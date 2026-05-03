---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q25, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Artifacts (first-class)" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Runs list screen (VirtualList with status badges, `d` dispatch form overlay → `agent_runs.create`, `Enter` opens run detail), Run detail + live log (streaming log lines via subscription `runs.onRunUpdate`; `x` cancel → `agent_runs.cancel` tRPC; "Run completed" banner on completion; subscription cleanup on navigate away), Artifacts browser (VirtualList; text artifact preview inline via pager; `w` write/download to disk path prompt; `D` delete with confirm → `artifacts.delete` tRPC).

- **Web**: `/runs`, `/runs/[id]`, `/artifacts` web routes.
- **CLI**: `fulcrum runs list --json`, `fulcrum runs cancel <id>`, `fulcrum artifact list --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [ ] Runs list: status badges (running/completed/failed/cancelled); `d` opens dispatch form with project + task selectors.
- [ ] Run detail: subscription fires → log lines append; `x` cancel → `agent_runs.cancel` called; "Run completed" banner; navigation away → unsubscribe.
- [ ] Artifacts browser: text file content preview (first 50 lines); `w` write to disk prompts path; `D` delete with confirm.
- [ ] After TUI dispatch run, web runs list shows new run; CLI `fulcrum runs list --json` reflects.
- [ ] Subscription live log: emit `graphile-worker` log line → TUI appends within 100ms (FakeTTY test with EventEmitter mock).

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-44–T15-46 maps to this slice.
