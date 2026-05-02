---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q25, Q35, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "Artifacts (first-class)", "Agent orchestration")
Docs: https://kit.svelte.dev/docs
---

# Agent runs (/runs, /runs/[id]) + Artifacts browser (/artifacts, /artifacts/[id])

## What to build

`/runs`: run list table (task title, agent, status badge, started_at, duration) + "Dispatch" button that opens run dispatch modal (project, task, agent selector). `/runs/[id]`: run detail with EventSource log stream (or SvelteKit load subscription), status badge, artifacts list (linked via `edges`), cancel button → `runs.cancel` tRPC. `/artifacts`: artifact browser with filter sidebar (kind/project/run filter) + inline preview (image thumbnail, text snippet). `/artifacts/[id]`: full preview pane (inline image/text with syntax highlight, download link), delete action, retention policy info (days remaining).

Cuts through: `runs.dispatch(taskId, agent)` tRPC → `agent_runs` row created → EventSource streams log lines → status badge live updates → `copyFileOut` writes artifacts → artifact row links via `edges`.

## Acceptance criteria

- [ ] Run list: dispatches form → `runs.dispatch` → new row appears; status badge shows `pending` → `running` → `completed` via poll/subscription.
- [ ] Run detail: log lines stream via EventSource; "Cancel" → `runs.cancel` → status → `cancelled`; artifacts section lists files produced.
- [ ] Artifact browser: filter by project → count changes; PNG thumbnail renders; text artifact shows first 200 chars.
- [ ] Artifact detail: inline preview (image fullsize, code file syntax highlighted); download link resolves to file; delete → `artifacts.delete` → removed from list; retention info shows days-remaining.
- [ ] Playwright: dispatch run → detail page → log lines appear → artifact listed → download works.
- [ ] CLI: `fulcrum agent run --task <id> --json`; `fulcrum artifact list --json`.
- [ ] TUI: run monitor + artifact list (Pillar 15).

## Blocked by

- Issue 01 (scaffold) — layout needed.
- Pillar 4 issue 03 (artifacts + edges migration) — `artifacts` table + `edges` table must exist.
