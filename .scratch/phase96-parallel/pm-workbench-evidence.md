# PM Workbench Slice Evidence

Date: 2026-05-17

Scope: PM/workbench/dependency-run UI slice only. This evidence does not claim global Phase 9.6 closure.

## Implemented

- Added work-management PM structure service for module CRUD and intake CRUD/detail behavior.
- Added project module list/detail pages under `/projects/[id]/modules`.
- Added project intake list/detail pages under `/projects/[id]/intake`.
- Added saved-view detail page under `/projects/[id]/settings/views/[viewId]` and linked saved-view rows to detail pages.
- Added project kind selector so workspace/project/subproject creation is exposed from the PM setup path.
- Added PM quick-nav links for modules, intake, and views.

## Boundary

- Web routes remain thin route/action surfaces.
- Module and intake business behavior lives in `services/work-management/src/application/pm-structure.ts`.
- Module trace IDs use `trace-module-*`.
- Intake requests are trace-linked work items with `trace-intake-*`.
- No docs/ACP/review files were edited by this slice.

## Verification

- `bun test services/work-management/src/application/pm-structure.test.ts services/work-management/src/application/manual-task-workbench.integration.test.ts services/work-management/src/interface/http/saved-view-public-api.persistence.test.ts`
  - 5 pass, 0 fail, 31 expect calls.
- `bun test 'apps/web/src/routes/projects/[id]/settings/views/page.server.test.ts' 'apps/web/src/routes/projects/[id]/board/page.server.test.ts' 'apps/web/src/routes/projects/[id]/board/run-preview.server.test.ts'`
  - 15 pass, 0 fail, 45 expect calls.
  - Bun exited 99 after PGlite-backed tests despite zero assertion failures.
- `bun test apps/cli/src/product.test.ts apps/tui/src/__tests__/task-list-manual-workbench.test.ts apps/tui/src/__tests__/task-list-dependency-run-preview.test.ts`
  - 22 pass, 0 fail, 142 expect calls.
- `bun run --bun tsc --noEmit`
  - exit 0.
- `git diff --check -- <PM scoped paths>`
  - exit 0.
- Required direct persistence scan:
  - `rg 'typeorm|EntityManager|Repository|DataSource|@mikro-orm|kysely' apps/web/src/routes/boards apps/web/src/routes/projects apps/web/src/lib/components/board apps/web/src/lib/components/tasks apps/cli/src apps/tui/src`
  - Results are existing test/assertion strings and repository-client naming false positives; no new PM route/component direct ORM usage was added.

## Known unrelated blocker

- `bun run --cwd apps/web check` fails in `apps/web/src/lib/components/docs/TiptapEditor.svelte` with Svelte `$from` variable-name error. This file is outside slice scope and was not edited.
