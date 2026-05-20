# plan-review — mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `plan-review` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

`<h1>Plan review path</h1>` / `<title>Workflow Review</title>` — NOT the OD Plan
review approve-gate tripane. It is a Build/Operate-settings surface (1383
lines): a six-stage workflow-status tracker (`docs/planning/execution/review/
uat/e2e`), an automation-rule builder (`rule-existing-review`, `previewRule()`,
`buildRuleSummary()`), a Jira/GitHub import preview (`githubPreviewIssues`,
`JIRA-105`...), and custom-field config. Type model: `Stage`, `Rule`,
`CustomFieldType`, `CustomField`, `ImportIssue`.

## Preserved artifact

- `+page.svelte.preserved` — the full 1383-line route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss).
- **Re-home destination:** the Build/Operate settings clusters (per
  `design-alignment/plan.md` §plan-review Migration notes — workflow-stage
  tracking and automation rules belong to Build/Operate; the importer/custom-
  field panels move to System/Settings per `migration-strategy.md`).
- **Owning rebuild PRD:** `prd-web-plan-review-od-fidelity`
  (`vertical-prds.jsonl`, status `proposed`) — it `depends_on` this PRD, and its
  acceptance bullet "The mislabelled workflow-tracker/automation/import/custom-
  field content is re-homed to Build/Operate settings with no feature loss"
  lifts this artifact.
- **Live route now:** `+page.server.ts` 308-redirects `/plan-review` →
  `/settings` (the live Settings surface, the named re-home destination for the
  workflow/automation content) so the old path never returns 404 until the OD
  tripane ships.
