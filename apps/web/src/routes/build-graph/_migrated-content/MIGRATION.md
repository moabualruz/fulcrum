# build-graph — mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `build-graph` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Task dependency execution</h1>` — NOT the OD Sugiyama dependency graph.
The body was a design-fixture grab-bag: a typography reference block
(`data-type-token`), a form-field reference (`data-form-field` for
text/email/password/number/url/...), presence/safe-save state, package-manifest
preview, conflict-safe destination, delete-impact preview, active-doc/trash-doc
rows, and an execution-feedback block. Only `data-dependency-node` rows +
`data-dependency-order` were graph-related, and only as a plain ordered list.

## Preserved artifact

- `+page.svelte.preserved` — the full 971-line route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss).
- **Re-home destination:** typography + form-field fixtures → `/design-kit`
  (the design-fixture surface, per `design-alignment/build.md` §build-graph
  Migration notes); presence/safe-save, package-manifest, delete-impact,
  active-doc/trash-doc fixtures → Capture/docs surfaces.
- **Owning rebuild PRD:** `prd-web-build-graph-od-fidelity` (`vertical-prds.jsonl`,
  status `proposed`) — it `depends_on` this PRD, and its acceptance bullet
  "The misnamed fixture content is re-homed: typography/form-field references
  to /design-kit, doc-trash fixtures to Capture/docs" lifts this artifact.
- **Live route now:** `+page.server.ts` 308-redirects `/build-graph` →
  `/design-kit` so the old path never returns 404 until the OD graph ships.
