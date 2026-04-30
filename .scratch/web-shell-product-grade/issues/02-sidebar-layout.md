# 02 — Sidebar layout + dark mode + active project picker

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: 01
File ownership:
- `src/web/src/routes/+layout.svelte`
- `src/web/src/routes/+layout.server.ts`
- `src/web/src/lib/components/app/**`
- `src/web/src/lib/state/active-project.ts`
- `src/web/src/hooks.server.ts`

Acceptance criteria:
- Persistent left sidebar (Dashboard / Projects / Docs / Board / Runs / Search) using shadcn `Sidebar` primitives.
- Top bar contains: breadcrumb derived from current route, project picker dropdown, theme toggle, cmd+K hint, avatar menu.
- Active project persisted in `fulcrum_active_project` cookie via `+layout.server.ts` and exposed through `event.locals.activeProjectId`.
- `mode-watcher` toggles between light/dark via shadcn `DropdownMenu` action.
- Mobile (<= 768px) collapses sidebar into a `Sheet`.
- No `console.log`/no debug text shipped.
