# build-timeline — mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `build-timeline` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Document version history</h1>` — NOT the OD Build Gantt timeline. It is the
`DESIGN.md §9.1` Document Version Review surface: a `data-version-row` version
list, an inline removed/added `data-diff-line` diff, backlinks, and a
`data-comment-row` review thread with resolve actions.

## Preserved artifact

- `+page.svelte.preserved` — the full route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss).
- **Re-home destination:** the Capture/docs cluster, alongside
  `apps/web/src/routes/docs` (per `design-alignment/build.md` §build-timeline
  Migration notes — the version timeline, restore confirmation, backlinks, and
  review-thread comment states belong with docs).
- **Owning rebuild PRD:** `prd-web-build-timeline-od-fidelity`
  (`vertical-prds.jsonl`, status `proposed`) — it `depends_on` this PRD, and its
  acceptance bullet "The misnamed Document-version-history content is re-homed
  to the Capture/docs cluster with no feature loss" lifts this artifact.
- **Live route now:** `+page.server.ts` 308-redirects `/build-timeline` →
  `/docs` so the old path never returns 404 until the OD Gantt ships.
