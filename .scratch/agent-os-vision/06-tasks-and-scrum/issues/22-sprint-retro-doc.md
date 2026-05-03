---
Status: implemented
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [17-sprints-trpc-crud]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, Q7, Q11]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Sprint/scrum/dev cycles row)
Docs: []
---

# Sprint close → retro doc auto-create (cross-ref Pillar 7)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-04, T6-32)

## What to build
When `sprints.close` is called, auto-create a `doc_type='postmortem'` retrospective
document via Pillar 7's doc-create API (if Pillar 7 is shipped). If Pillar 7 is not
yet available, emit `sprint.closed` event with full metrics snapshot; Pillar 7 adds
the listener when it ships. Implement the event listener in `src/events/handlers/sprint-closed.ts`
that calls `docs.create` and is guarded by a Pillar 7 availability check.

## Acceptance criteria
- [ ] Logic: `sprint.closed` event handler in `src/events/handlers/sprint-closed.ts` calls `docs.create({doc_type:'postmortem', title:'Retro: <sprint_name>', project_id, content_stub})`
- [ ] Logic: handler is idempotent — re-processing same event ID does not create duplicate doc (uses `event_id` dedup in handler log)
- [ ] Logic: if `docs.create` tRPC procedure not available (Pillar 7 not shipped) → handler logs warning and exits gracefully; no crash
- [ ] Logic: retro doc content stub includes sprint dates, goal, metrics summary (capacity, completed points, velocity delta) formatted as TipTap JSON paragraph nodes
- [ ] Web: after sprint close, success toast includes "View retro doc" link if doc created; link navigates to doc detail (Pillar 7 route, may 404 if not shipped)
- [ ] Web: sprint list row shows "Retro" badge + link for completed sprints that have a retro doc
- [ ] CLI: `fulcrum sprints close --json` response includes `{retro_doc_id: uuid | null}`
- [ ] TUI: sprint close confirmation shows "Retro doc will be created" message; post-close shows retro doc ID
- [ ] Tests: event handler creates doc with correct `doc_type` and title for fixture sprint
- [ ] Tests: handler called twice with same event ID creates only one doc (idempotency)
- [ ] Tests: handler with unavailable `docs.create` logs warning, returns without error
- [ ] Tests: CLI close response includes `retro_doc_id` field (null when Pillar 7 absent)

## Blocked by
- 17-sprints-trpc-crud

## Notes / Tech-stack hints
- Event handler registered via graphile-worker or in-process event bus; consistent with Pillar 1's event dispatch mechanism
- `sprint.closed` event payload (from slice 17) includes `metrics_snapshot` — use this for retro doc content without additional DB queries
- When Pillar 7 ships its `docs.*` tRPC router, the Pillar 7 implementer wires the listener; this slice only implements the handler and guards
