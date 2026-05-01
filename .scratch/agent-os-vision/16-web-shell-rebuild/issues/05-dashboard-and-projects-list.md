---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 06-tasks-and-scrum/issues/01-tasks-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [C4, Q28, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Jira-grade task management")
Docs: https://kit.svelte.dev/docs
---

# Dashboard (/) and Projects list (/projects)

## What to build

Build two routes: `/` (dashboard) and `/projects` (project list + create dialog). Dashboard: project tiles (name, open tasks count, last activity), open tasks global counter, recent agent runs widget (last 5 with status badge), bell badge (unread notification count from 60s poll). Projects route: TanStack Table list with columns (name, sprint_model, task count, updated_at) + "New Project" dialog (name, description, sprint_model select). Create project calls `projects.create` tRPC → navigates to `/projects/[id]`.

Cuts through: `projects.list` tRPC → SSR load → project tiles rendered → bell badge polls `notify.unreadCount` → Playwright assert project link navigates.

## Acceptance criteria

- [ ] `/` SSR renders within <100ms p95 (Playwright performance assertion); project tiles show name + open task count.
- [ ] Bell badge shows unread count; count updates within 60s of new event (poll via SvelteKit `invalidate()`).
- [ ] Recent runs widget: last 5 `agent_runs` rows with status badge; click navigates `/runs/[id]`.
- [ ] `/projects`: table renders with sort by `name` and `updated_at`; create dialog opens; valid submit → new project appears in list without full reload.
- [ ] Project tile click → `/projects/[id]` resolves (no 404).
- [ ] Playwright: create project → list shows new row → tile click → overview loads.
- [ ] CLI: `fulcrum project list --json` returns same projects (three-surface parity via shared tRPC).
- [ ] TUI: project list screen renders same data (Pillar 15 parity fixture).

## Blocked by

- Issue 01 (shell scaffold) — routes require layout.
- Pillar 6 issue 01 (tasks schema migration) — `projects` table must exist.
