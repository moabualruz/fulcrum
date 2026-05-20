# build-runs — mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `build-runs` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Code review loop</h1>` — NOT the OD Build runs feed. It is the Review
code-review workbench: a unified diff with `data-diff-line` rows, inline
annotation (`data-annotate-line`), feedback export, an `Approval` block, an
"Automated feedback exhaustion" gate with `data-agent-job-tab` job tabs, and a
`UatCodeReviewHandoff`.

## Preserved artifact

- `+page.svelte.preserved` — the full route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss).
- **Re-home destination:** the Review cluster code-review workbench at
  `/.../review/<reviewId>` (per `design-alignment/build.md` §build-runs
  Migration notes — the `feedback-jobs` / QA-exhaustion-gate / UAT-handoff
  fixtures belong to Review).
- **Owning rebuild PRD:** `prd-web-build-runs-feed-od-fidelity`
  (`vertical-prds.jsonl`, status `proposed`) — it `depends_on` this PRD, and its
  acceptance re-homes the code-review-loop content into the Review workbench.
  The Review workbench's own OD-fidelity PRD (`prd-web-review-workbench-od-
  fidelity`) is the eventual home of the lifted content.
- **Live route now:** `+page.server.ts` 308-redirects `/build-runs` → `/runs`
  (the existing runs surface) so the old path never returns 404 until the OD
  runs feed ships.
