# Phase 9.6 W8/W9 PM Cutover Audit

Date: 2026-05-17
Mode: read-only audit of runtime/source; this file is the only written artifact.

## Sources Of Truth

- `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/09.6-CORRECT-RESTART-COPY-FIRST-WORKFLOW-PLAN.md`
- `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/09.6-COPY-FIRST-GOAL-TRACKER.md`
- `docs/superpowers/plans/2026-05-15-mikroorm-to-typeorm-migration.md`
- `docs/superpowers/specs/2026-05-15-mikroorm-to-typeorm-migration-design.md`

## Acceptance Read

- W8 requires board/task run actions with dependency-tree disclosure before execution.
- W9 requires dependency-aware execution, ordered dependency scheduling, run lineage/events, live feedback, and web/CLI/TUI exposure.
- Cross-cutover requirements require web/CLI/TUI to remain invocation/visualization layers, avoid direct ORM calls, preserve shared trace/link IDs, and prove TypeORM/Nest service cutover through PGlite/PostgreSQL and cross-surface tests.
- Tracker still names the open blocker as: "W8/W9 final PM surface and broader service-cutover evidence." Current code/tests now contain substantial proof for both, but a few compatibility seams remain.

## Proof Already Present

### Web PM Surface

- `apps/web/src/routes/projects/[id]/board/+page.server.ts`
  - Imports service interfaces only for the W8/W9 path: `@work-management/interface/project-board.ts`, `@execution-orchestration/interface/dependency-run-actions.ts`, `@execution-orchestration/interface/task-run-reviews.ts`.
  - Load returns project board plus manual workbench data through `buildProjectTaskWorkbench`.
  - `runPreview` calls workflow API when project API is configured, else local service interface `previewDependencyRunForTasks`.
  - `run` calls workflow API when configured, else local service interface `dispatchDependencyRunForTasks`.
  - Review action delegates through `recordTaskQaReview`.

- `apps/web/src/routes/projects/[id]/board/+page.svelte`
  - Renders manual workbench trace summary.
  - Opens dependency preview overlay before dispatch.
  - Uses `DependencyTree` for ordered dependency disclosure.
  - Dispatch button is disabled when preview is blocked.

- `apps/web/src/lib/components/board/DependencyTree.svelte`
  - Dependency disclosure component has tests for target tasks, blockers, warnings, dependency depth, and empty chain state.

- `apps/web/src/routes/tasks/[id]/+page.server.ts`
  - Task detail exposes `runPreview`, `run`, and `runFeedback` actions.
  - Uses workflow API first for active project, otherwise service interfaces: `previewDependencyRunForTasks`, `dispatchDependencyRunForTasks`, `loadDependencyRunLiveFeedback`.
  - Passes trace IDs through preview/dispatch/feedback.

- `apps/web/src/routes/tasks/[id]/+page.svelte`
  - Task detail renders preview, dispatch, scheduled/skipped runs, and live feedback blocks with trace/run group IDs.
  - Uses `EventSource` against `run-feedback` for live dependency-run feedback.

- `apps/web/src/routes/tasks/[id]/run-feedback/+server.ts`
  - Streams public workflow API live feedback when configured.
  - Falls back to local service interface stream/topic path.

- `apps/web/src/routes/projects/[id]/runs/[runId]/+page.server.ts`
  - Imports run service interfaces: `getProjectRunPageData`, `cancelRun`, `retryRun`.
  - Returns run detail payload, transcript, and events.

- `apps/web/src/routes/projects/[id]/runs/[runId]/+page.svelte`
  - Renders run detail header, status, metadata, cancel/retry controls.
  - Provides transcript, payload, and event tabs.

### CLI/TUI Parity

- `apps/cli/src/product.ts`
  - Exposes `fulcrum product tasks run-preview`, `run`, `run-feed`, and `run-worker`.
  - Routes W8/W9 operations through the configured task/workflow caller, including `previewDependencyRun`, `dispatchDependencyRun`, `dependencyRunLiveFeedback`, `dependencyRunLiveFeedbackStream`, and `tickDependencyRunWorker`.
  - Preserves `projectId`, `traceId`, `runId`, and task IDs in command input builders.

- `apps/tui/src/index.ts`
  - TUI caller contract includes preview, dispatch, live feedback, live feedback stream, and QA review task operations.
  - Root task screen passes caller methods into `TaskListScreen`.

- `apps/tui/src/screens/task-list.ts`
  - Renders dependency run preview, workbench trace, dispatch group, feedback trace, and run event feedback.
  - Handles preview, dispatch, feedback load, and subscription refresh through injected caller methods.

### Shared Trace/Link IDs

- Web board tests pass trace through workbench, preview, dispatch, and review actions.
- Task detail tests pass trace through preview, dispatch, feedback, and SSE feedback.
- TUI tests preserve `trace-tui-preview`, `trace-tui-dispatch`, and run group IDs across preview, dispatch, live feedback, and subscription events.
- CLI local caller tests preserve `trace-cli` across preview, feedback, worker tick, review, UAT, and E2E proof paths.
- UAT client contract tests prove CLI run dispatch/watch preserve canonical run trace.

## Verification Run During Audit

Focused W8/W9 gate:

```text
bun test apps/web/src/lib/components/board/DependencyTree.svelte.test.ts 'apps/web/src/routes/projects/[id]/runs/[runId]/page.svelte.test.ts' 'apps/web/src/routes/projects/[id]/runs/[runId]/page.server.test.ts' 'apps/web/src/routes/projects/[id]/board/page.server.test.ts' apps/tui/src/__tests__/task-list-dependency-run-preview.test.ts --test-name-pattern 'DependencyTree|runs/\[runId\]|dependency|run detail|local fallback run|TUI dependency run preview'
```

Result: 14 pass, 0 fail, 73 expect calls.

Broader service-cutover audit cluster:

```text
bun test tests/architecture/repo-structure.test.ts tests/architecture/responsibility-first-naming.test.ts tests/architecture/migrations.test.ts services/workflow-coordination/src/infrastructure/database/workflow-spine.migration.test.ts services/planning-review/src/infrastructure/database/review-workflow.migration.test.ts services/execution-orchestration/src/infrastructure/database/run-context.migration.test.ts services/work-management/src/interface/http/project-public-api.persistence.test.ts services/knowledge-workspace/src/interface/http/document-public-api.persistence.test.ts services/execution-orchestration/src/interface/http/agent-run-public-api.persistence.test.ts apps/cli/src/local-caller.test.ts apps/cli/src/__tests__/surface-parity-smoke.test.ts tests/uat/client-contract.test.ts tests/uat/workflow-fixture.test.ts
```

Result: 75 pass, 0 fail, 268 expect calls.

Scan evidence:

- `rg --files -g '*.sql' -g '!node_modules' -g '!vendor-src' -g '!preserved-upstream'` returned no files.
- Focused W8/W9 app-surface scan over web board/runs/task-detail, board components, CLI product command, TUI index/task-list found no direct ORM/MikroORM/Kysely imports in web/TUI W8/W9 files.
- Same focused scan found one app-layer import in the CLI product command: `apps/cli/src/product.ts:3` imports `initializeLocalProductReadiness` from `@platform-core/application/cli-tui/product-readiness.ts`. This is platform readiness, not W8/W9 dependency-run business logic, but it violates a strict "zero app-layer imports in app surfaces" reading.

## Gaps

1. Tracker/status gap: the goal tracker still labels W8/W9 final PM surface and broader service-cutover evidence as pending even though the focused W8/W9 proof and 75-test service-cutover cluster now pass.

2. Strict app-layer import gap: `apps/cli/src/product.ts` still imports one platform application helper. It is not direct ORM and not dependency-run logic, but a strict app-surface boundary scan is not zero.

3. Service-interface compatibility seam: the W8/W9 web local fallback path still passes `EntityManager` into service interface wrappers that dynamically import application modules:
   - `services/work-management/src/interface/project-board.ts`
   - `services/work-management/src/interface/work-item-actions.ts`
   - `services/work-management/src/interface/work-item-detail.ts`
   - `services/execution-orchestration/src/interface/dependency-run-actions.ts`
   - `services/execution-orchestration/src/interface/dependency-run-live-feedback.ts`
   - `services/execution-orchestration/src/interface/run-pages.ts`
   - `services/execution-orchestration/src/interface/run-actions.ts` or adjacent run action interface modules

   This is not a web/CLI/TUI direct ORM leak, and tests pass, but it means the local fallback cutover is still compatibility-wrapper based rather than fully Nest public API / injectable service based.

4. PM surface gap if "final" means every Plane-style view: W7 has board/list/table proof and W8/W9 attach dependency actions to board/task detail/run detail. Gantt/calendar and saved-view surfaces are not shown by the W8/W9 focused gate as dependency-run launch points. If the intended final PM surface requires run controls on every PM view, that proof is missing.

## Smallest Non-Overlapping Slice To Close W8/W9

Slice name: W8/W9 PM cutover closure proof.

Scope:

- Keep runtime behavior unchanged.
- Move `initializeLocalProductReadiness` behind a CLI/TUI-facing interface helper, or explicitly document/guard it as platform bootstrap outside PM business logic.
- Replace W8/W9 local fallback service wrappers with service-owned interface functions that no longer require app surfaces to pass `EntityManager` directly. Minimum targets:
  - `@work-management/interface/project-board.ts`
  - `@work-management/interface/work-item-detail.ts`
  - `@work-management/interface/work-item-actions.ts`
  - `@execution-orchestration/interface/dependency-run-actions.ts`
  - `@execution-orchestration/interface/dependency-run-live-feedback.ts`
  - `@execution-orchestration/interface/run-pages.ts`
- Add one focused boundary test that scans only W8/W9 app entry files and fails on `@*/application/`, `@*/infrastructure/`, `typeorm`, `@mikro-orm`, `kysely`, and direct query builder patterns.
- If final PM means all views, add dependency-run launch/preview proof to calendar/gantt/list/table or write a tracker decision limiting W8/W9 launch points to board + task detail + run detail.
- Update the Phase 9.6 tracker evidence block after the focused W8/W9 gate and broader 75-test service-cutover cluster pass.

Suggested proof commands:

```text
bun test apps/web/src/lib/components/board/DependencyTree.svelte.test.ts 'apps/web/src/routes/projects/[id]/runs/[runId]/page.svelte.test.ts' 'apps/web/src/routes/projects/[id]/runs/[runId]/page.server.test.ts' 'apps/web/src/routes/projects/[id]/board/page.server.test.ts' 'apps/web/src/routes/tasks/[id]/run-preview.server.test.ts' apps/tui/src/__tests__/task-list-dependency-run-preview.test.ts apps/cli/src/local-caller.test.ts --test-name-pattern 'DependencyTree|runs/\[runId\]|dependency|run detail|local fallback run|task detail|TUI dependency run preview|dependency-run'
```

```text
bun test tests/architecture/repo-structure.test.ts tests/architecture/responsibility-first-naming.test.ts tests/architecture/migrations.test.ts services/workflow-coordination/src/infrastructure/database/workflow-spine.migration.test.ts services/planning-review/src/infrastructure/database/review-workflow.migration.test.ts services/execution-orchestration/src/infrastructure/database/run-context.migration.test.ts services/work-management/src/interface/http/project-public-api.persistence.test.ts services/knowledge-workspace/src/interface/http/document-public-api.persistence.test.ts services/execution-orchestration/src/interface/http/agent-run-public-api.persistence.test.ts apps/cli/src/local-caller.test.ts apps/cli/src/__tests__/surface-parity-smoke.test.ts tests/uat/client-contract.test.ts tests/uat/workflow-fixture.test.ts
```

## Bottom Line

Current W8/W9 behavior is substantially present and verified for project board, task detail, run detail, CLI command path, and TUI task-list path. The focused W8/W9 gate and broader service-cutover cluster pass now. Remaining closure work is small and boundary/status oriented: eliminate or explicitly own the last CLI app-layer import, remove `EntityManager` compatibility seams from W8/W9 service interfaces if strict cutover is required, and update tracker evidence so Phase 9.6 no longer carries a stale W8/W9 blocker.
