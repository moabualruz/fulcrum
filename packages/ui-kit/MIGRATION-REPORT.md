# UI Kit Migration Report

## PRD

prd-ui-kit-retrofit-existing-routes

## Added Or Extended Primitives

- Re-exported `buttonVariants`, `ButtonProps`, `ButtonSize`, and `ButtonVariant` from `@fulcrum/ui-kit` so existing route/class call sites can consume the canonical Button primitive without a local clone import.
- Removed automatic `tokens.css` side-effect imports from UI-kit component entrypoints. Host apps own token loading; importing a primitive must not override route-level design tokens or make design E2E order-dependent.

## Retrofitted Imports

- Replaced route and component imports for `Button` / `buttonVariants` with `@fulcrum/ui-kit`.
- Replaced route and component imports for `Input`, `Label`, `Textarea`, and `Badge` with `@fulcrum/ui-kit`.
- Replaced `Sheet`, `Popover`, `Select`, and `Dialog` namespace imports in existing route/component surfaces with direct `@fulcrum/ui-kit` exports.

## Files Touched

- `apps/web/src/lib/components/agents/AgentSessionWorkbench.svelte`
- `apps/web/src/lib/components/app/AppSidebar.svelte`
- `apps/web/src/lib/components/app/AppTopbar.svelte`
- `apps/web/src/lib/components/app/ProjectPicker.svelte`
- `apps/web/src/lib/components/board/BoardSheet.svelte`
- `apps/web/src/lib/components/docs/DocCommentPanel.svelte`
- `apps/web/src/lib/components/docs/DocTemplatesManager.svelte`
- `apps/web/src/lib/components/docs/DocTree.svelte`
- `apps/web/src/lib/components/docs/DocVersionTimeline.svelte`
- `apps/web/src/lib/components/docs/DocsSidebar.svelte`
- `apps/web/src/lib/components/projects/SetActiveButton.svelte`
- `apps/web/src/lib/components/tasks/BulkActionBar.svelte`
- `apps/web/src/lib/components/tasks/BulkCustomFieldEdit.svelte`
- `apps/web/src/lib/components/tasks/FilterBuilder.svelte`
- `apps/web/src/lib/components/tasks/QuickFilters.svelte`
- `apps/web/src/lib/components/ui/alert-dialog/alert-dialog-action.svelte`
- `apps/web/src/lib/components/ui/alert-dialog/alert-dialog-cancel.svelte`
- `apps/web/src/lib/components/ui/command/command-dialog.svelte`
- `apps/web/src/lib/components/ui/dialog/dialog-content.svelte`
- `apps/web/src/lib/components/ui/dialog/dialog-footer.svelte`
- `apps/web/src/lib/components/ui/form/form-button.svelte`
- `apps/web/src/lib/components/ui/form/form-label.svelte`
- `apps/web/src/lib/components/ui/input-group/input-group-button.svelte`
- `apps/web/src/lib/components/ui/input-group/input-group-input.svelte`
- `apps/web/src/lib/components/ui/input-group/input-group-textarea.svelte`
- `apps/web/src/lib/components/ui/sheet/sheet-content.svelte`
- `apps/web/src/routes/+error.svelte`
- `apps/web/src/routes/+layout.svelte`
- `apps/web/src/routes/agents/+page.svelte`
- `apps/web/src/routes/artifacts/+page.svelte`
- `apps/web/src/routes/context/preview/+page.svelte`
- `apps/web/src/routes/docs/+page.svelte`
- `apps/web/src/routes/docs/[id]/+page.svelte`
- `apps/web/src/routes/docs/[id]/edit/+error.svelte`
- `apps/web/src/routes/docs/[id]/edit/+page.svelte`
- `apps/web/src/routes/docs/[id]/history/+error.svelte`
- `apps/web/src/routes/docs/[id]/planning/+error.svelte`
- `apps/web/src/routes/docs/global/+page.svelte`
- `apps/web/src/routes/docs/new/+page.svelte`
- `apps/web/src/routes/inference/+page.svelte`
- `apps/web/src/routes/memory/+page.svelte`
- `apps/web/src/routes/memory/[id]/+page.svelte`
- `apps/web/src/routes/orchestration/+page.svelte`
- `apps/web/src/routes/projects/+page.svelte`
- `apps/web/src/routes/projects/[id]/+error.svelte`
- `apps/web/src/routes/projects/[id]/activity/+page.svelte`
- `apps/web/src/routes/projects/[id]/settings/memory/+page.svelte`
- `apps/web/src/routes/repos/+page.svelte`
- `apps/web/src/routes/repos/[id]/+page.svelte`
- `apps/web/src/routes/repos/[id]/branches/+page.svelte`
- `apps/web/src/routes/repos/[id]/commits/+page.svelte`
- `apps/web/src/routes/repos/[id]/commits/[sha]/+page.svelte`
- `apps/web/src/routes/runs/+page.svelte`
- `apps/web/src/routes/settings/backups/+page.svelte`
- `apps/web/src/routes/settings/data/+page.svelte`
- `apps/web/src/routes/settings/errors/+page.svelte`
- `apps/web/src/routes/settings/feature-flags/+page.svelte`
- `apps/web/src/routes/settings/inference/+page.svelte`
- `apps/web/src/routes/settings/notifications/+page.svelte`
- `apps/web/src/routes/settings/secrets/+page.svelte`
- `apps/web/src/routes/settings/skills/+page.svelte`
- `apps/web/src/routes/settings/telemetry/+page.svelte`
- `apps/web/src/routes/tasks/[id]/+page.svelte`
