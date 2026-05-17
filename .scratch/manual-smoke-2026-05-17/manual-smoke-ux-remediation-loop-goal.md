# Goal: Manual Smoke, Harsh UX Critique, and Remediation Loop

Drive Fulcrum through a full manual smoke, harsh UI/UX critique, and remediation loop until every major surface and workflow is smoke-passable, visually coherent, and product-value complete.

## Start With Critique And Testing

Before fixing anything, run a full current-state critique pass. Treat the product like a real user would: impatient, skeptical, and trying to complete work without knowing internal implementation details.

Criticize hard. Do not soften broken UX as "early" or "scaffolded." Blank shells, unclear navigation, generic errors, broken affordances, missing next actions, hidden configuration requirements, confusing labels, weak hierarchy, poor density, mobile collisions, and dead advertised endpoints are all product failures until fixed or explicitly documented as non-blocking with evidence.

Target every part of the repo and every user-facing surface:

- Web app: dashboard, projects, project creation, board, docs, doc editor, planning, ACP sessions, review/UAT, runs, artifacts, inbox/notifications, search, repos, audit, doctor, settings, routing, connectors, flags, inference, API settings, mobile layouts.
- CLI: help, doctor, auth/config state, project/doc/task/workflow commands, workflow acceptance-cycle command, generated E2E command path, error messages, local-first behavior, required env clarity.
- TUI: boot, first frame, nav, command palette, workflow screens, status/footer clarity, selected state visibility, keyboard behavior, API/runtime status display.
- API/NestJS/TypeORM: boot, OpenAPI, public API endpoints, workflow endpoints, trace summary, docs/artifacts/audit/organizations/runs/search endpoints, PGlite and PostgreSQL paths.
- Local-first runtime: default PGlite, PostgreSQL switch, migrations, seeded local identity, local API token, file/artifact paths.
- Shared workflow traceability: trace IDs, project IDs, doc IDs, task IDs, run IDs, artifact IDs, generated E2E IDs, and UI/API/CLI/TUI linkage.
- Source/docs/tracker artifacts: critique report, smoke JSON logs, screenshots, source-of-truth planning/tracker files when code changes affect them.

For each tested area, capture:

- Exact command or browser route.
- HTTP status or process exit code.
- Screenshot path for visual surfaces.
- Log path for API/CLI/TUI/server evidence.
- UX criticism: hierarchy, layout, density, readability, affordance clarity, error handling, recovery path, traceability, mobile behavior, copy, and whether the screen helps the required workflow.
- Whether the area blocks smoke, blocks workflow proof, or is non-blocking polish.

Do not accept the following as passing:

- Blank pages or empty chrome without useful empty state and primary action.
- Generic `500`, `502`, "Something went wrong", or raw internal error without route-specific recovery.
- API settings or docs advertising endpoints that are dead in the current dev setup.
- Screens that require hidden environment variables without a visible diagnostic or `doctor` guidance.
- UI that looks technically loaded but does not support a real workflow step.
- CLI/TUI surfaces that only show help while the real workflow command path is broken.
- Generated E2E artifacts that are only planned but not executed.
- Full workflow proof without shared trace/link IDs.

## Required Workflow Under Test

Prove this workflow end to end through real data and current public surfaces:

`freeform docs -> ACP planning -> prototype/boilerplate review -> PM task/dependency execution -> QA/review -> UAT/code review -> real-data E2E`

The workflow must be visible and testable across:

- Web
- CLI
- TUI
- API/NestJS/TypeORM
- PostgreSQL/PGlite local-first runtime
- Shared trace/link IDs

## Loop

Repeat until no blocking issue remains.

1. Read the current critique, smoke logs, screenshots, source-of-truth docs, and relevant code.
2. Pick the highest-priority blocker preventing smoke testing, workflow proof, or credible UX.
3. State exit criteria before editing.
4. Fix the code with narrow ownership.
5. Update required docs, critique, tracker, and evidence artifacts in the same slice.
6. Run focused verification for the changed surface.
7. Restart affected dev servers.
8. Rerun manual smoke for affected Web/API/CLI/TUI areas.
9. Capture fresh screenshots and logs.
10. Update the critique report with fixed items, remaining blockers, new issues, screenshot paths, commands, and evidence.
11. Move to the next blocker.

Use focused slices, but do not stop at isolated green tests. The loop only ends after the full smoke and full verification gates pass.

## Priority Order

P0: Boot and runtime blockers.

- API must boot and bind.
- TUI must render first interactive frame.
- Web must load local TypeORM/PGlite state without runtime crashes.
- CLI must execute real workflow commands against local runtime.
- Migrations must run through TypeORM only.

P1: Local data/API coherence.

- Web API settings must point at working current dev behavior.
- `/api/v1/*` behavior must be coherent: proxy or server route, not dead advertised URLs.
- Dashboard, projects, docs, inbox, artifacts, audit, settings/routing, settings/connectors must not show generic 500/502/blank shells.

P2: Workflow value.

- Docs workbench/editor supports create, edit, read, binary attachment upload/download through public APIs.
- ACP sessions create, persist, stream traffic, and expose trace/session linkage.
- Planning output hands off into task/dependency execution.
- Review, QA, UAT, and code-review surfaces are discoverable and usable.
- Real-data E2E runs through final UI/API path with generated test proof.

P3: Harsh UX/UI/design remediation.

- Replace blank shells with useful empty states and primary actions.
- Replace generic errors with route-specific recovery, retry, diagnostics, and trace IDs.
- Fix mobile wrapping, header collisions, hidden controls, and cramped forms.
- Make navigation reflect the workflow, not just feature buckets.
- Improve hierarchy, density, visual scanning, button affordances, form validation, and copy.
- Keep Fulcrum feeling like a workbench for getting agent-managed product work done, not a disconnected admin panel.

P4: Full proof.

- Web route screenshots, desktop and mobile.
- CLI help plus real workflow commands.
- TUI interactive smoke and terminal/app screenshots.
- API endpoint smoke including OpenAPI and workflow endpoints.
- Generated E2E command executed successfully.
- Full `bun run ci` green.
- Dev servers left running for human review.

## Invariants

- Web, CLI, and TUI are invocation and visualization layers only.
- Business logic and persistence belong in services/API.
- One ORM: TypeORM only.
- One server/API framework: NestJS-native final structure.
- No `.sql` migrations.
- Runtime names describe responsibility/value/behavior, not phase/source-product/progress.
- Preserve ignored upstream repos under `.scratch/upstream-product-replacement`.
- Every code change updates relevant docs/tracker/critique artifacts in the same slice.
- Do not claim complete while startup failures, blank screens, dead endpoints, or untested surfaces remain.

## Success Criteria

The goal is complete only when all conditions are true:

- API boots and serves expected endpoints.
- TUI boots and supports smoke workflow navigation.
- CLI executes real workflow commands against the local runtime.
- Web core workflow screens have no generic 500/502/blank-shell failures.
- Full workflow is proven end to end with real data and shared trace/link IDs.
- Generated E2E tests are created and executed successfully.
- Fresh critique report says no remaining blockers and includes screenshot index for all tested areas.
- Full `bun run ci` passes.
- Dev servers remain running for human review.

## Exit Output

Return:

- Final critique/audit report path.
- Screenshot directory and screenshot index paths.
- Running dev server URLs/ports.
- Summary of fixed blockers.
- Summary of remaining non-blocking polish.
- Exact verification commands and results.
