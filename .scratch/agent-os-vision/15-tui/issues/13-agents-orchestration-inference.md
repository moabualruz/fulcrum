---
Status: completed
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/10-runs-and-artifacts.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q4, Q34, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Agent orchestration + manual assign" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Agents registry screen (`/agents`; list registered agent profiles; `Enter` opens agent detail with capability list; `d` opens dispatch run form), Orchestration dashboard (`/orchestration`; live run list with claim state badges; subscription `orchestration.onStateChange` updates; orchestrator status indicator), Inference dashboard (`/inference`; sidecar status row; model list with size + status; `s` start/stop toggle → `inference.start|stop` tRPC; subscription `inference.onSidecarStatus` live updates).

- **Web**: `/agents`, `/orchestration`, `/inference` web routes.
- **CLI**: `fulcrum symphony status --json`, `fulcrum inference status --json`, `fulcrum inference start/stop`.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Agents registry: all registered CLI agents listed (claude-code, codex, pi, opencode, etc.); `d` dispatch form with project/task selectors; submit → `agent_runs.create`.
- [x] Orchestration dashboard: live run list; claim state badges (`pending`/`claimed`/`running`/`completed`); subscription fires → row updates within 200ms.
- [x] Inference dashboard: sidecar status (running/stopped/error); model list with `default` badge; `s` start → `inference.start` → status updates; `s` stop → `inference.stop`.
- [ ] After TUI dispatch, web orchestration dashboard shows new run; CLI `fulcrum runs list --json` reflects.
- [ ] After TUI `inference start`, CLI `fulcrum inference status --json` shows `status='running'`.

## Blocked by

- 15/issues/10-runs-and-artifacts.md

## Notes

T15-53–T15-55 maps to this slice.
