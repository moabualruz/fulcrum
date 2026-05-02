---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 07-routing-trpc-procedures
---

# Web /settings/routing + /projects/<id>/routing pages

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Build the SvelteKit routing settings pages: `/settings/routing` (global rules) and `/projects/[id]/routing` (project-scoped rules with inherited globals shown below). Features: rule list with priority, create/edit/delete via modal form (field-selector + operator + value builder; raw JSON toggle; OR/AND nesting), drag-to-reorder priority, and a test panel (paste task JSON → shows which rule fires + assigned agent).

## Acceptance criteria

- [ ] Schema / module: `src/routes/(app)/settings/routing/+page.svelte` renders rule list
- [ ] Schema / module: `src/routes/(app)/projects/[id]/routing/+page.svelte` renders project rules + global inherited rules
- [ ] Logic: rule list loads via `trpc.routing.list`; displays name, agent, scope, priority, source, enabled toggle
- [ ] Logic: create form validates `conditions_json` via Zod before calling `trpc.routing.create`; malformed conditions show inline error
- [ ] Logic: drag-to-reorder updates `priority` values via `trpc.routing.update` calls in order
- [ ] Logic: test panel calls `trpc.routing.dryRun` with the pasted JSON; shows matched rule name + agent or "no match"
- [ ] Logic: project-scoped `/projects/[id]/routing` passes `projectId` to all tRPC calls; global rules visible but read-only in this view
- [ ] Surfaces parity: all CRUD operations available on Web match CLI and TUI equivalents
- [ ] Tests: Playwright e2e — create rule, verify in list, test panel shows correct agent, delete rule
- [ ] Tests: Zod validation error renders inline (not a toast) for malformed conditions

## Blocked by

- `07-routing-trpc-procedures`

## Notes

Rule condition editor: start with a simple field/operator/value row builder (add row = AND; nested group = OR). Raw JSON textarea toggle for power users. Both save the same `conditions_json` structure. No WYSIWYG needed — just functional.
