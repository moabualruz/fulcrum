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

## Full-Coverage Interaction Mandate

This goal is not limited to route-level smoke. Treat every visible control, command, input, card, menu, tab, filter, action, link, modal, drawer, upload, download, stream, retry, diagnostic, and empty/error state as requiring manual E2E simulation.

Test every and each:

- Button, icon button, segmented control, checkbox, toggle, select, menu item, tab, link, breadcrumb, command palette item, keyboard shortcut, and route transition.
- Text input, textarea, search box, filter field, numeric input, date field, token/API-key field, file picker, binary upload, and generated/downloaded file.
- CLI command, subcommand, flag, help path, JSON output path, human output path, bad-input path, missing-config path, and real runtime path.
- TUI navigation item, keyboard movement, command palette action, detail pane, status/footer state, error state, API-disconnected state, and workflow path.
- API endpoint, OpenAPI contract, auth/header behavior, validation error, not-found error, trace lookup, write path, read path, stream/poll path, and generated artifact path.
- Service-owned workflow transition, persistence path, migration path, TypeORM repository path, PGlite path, PostgreSQL path, and boundary between interface and service logic.

Use harsh UI/UX criticism at every level:

- Page architecture: does this screen explain why it exists and what work happens next?
- Workflow fit: does it move the required Fulcrum workflow forward or just expose a table?
- Hierarchy: can a first-time user identify the primary action in three seconds?
- Density: is the screen too sparse, too noisy, or too admin-like for repeated work?
- Affordance: do buttons, icons, fields, menus, and statuses clearly communicate what will happen?
- Copy: does text name the user value and recovery path, or leak internal implementation?
- Error handling: does every failure have route-specific context, retry, diagnostics, and trace ID?
- Mobile: do headers, controls, tables, panels, and forms fit without wrapping, clipping, or hiding essential action?
- Accessibility: can keyboard users reach and activate every control; are labels and focus states clear?
- Logic: does the UI state match API/server truth after every action?
- Value: does the feature make Fulcrum better than a generic project tracker, doc app, or agent log viewer?

Feel free to recommend or implement full overhauls when the evidence shows a surface is structurally wrong. Do not patch around a bad screen if the right fix is to replace its information architecture, workflow ordering, component layout, empty-state model, or navigation placement. Record overhaul recommendations as PRD items with clear incentives and acceptance criteria.

## PRD Backlog File

Use `/Users/mkh/workspace/fulcrum/.scratch/prd.json` as the machine-readable backlog for this loop.

Rules:

- Read it at the start of every loop.
- Append new PRD items when a critique discovers missing value, broken UX, weak logic, or an overhaul opportunity.
- Do not delete or rewrite existing PRD items during the loop; duplicates can be cleaned later after parallel agents finish.
- Keep each item small enough to own and verify, but broad enough to represent a useful product slice.
- Every item starts with `"passes": false` and becomes true only when current smoke evidence, screenshots, logs, and focused tests prove it.
- Use exact evidence paths, commands, screenshots, and trace IDs in `evidence`.
- Prefer 20-30 deep targeted analysis/implementation subagents or work packages over vague large buckets when planning a full pass. Partition by non-overlapping files/surfaces.

Minimum PRD item shape:

```json
{
  "id": "prd-web-dashboard-001",
  "surface": "web",
  "area": "dashboard",
  "passes": false,
  "priority": "P1",
  "intent": "What user value this area must deliver.",
  "critique_focus": ["hierarchy", "workflow fit", "empty state", "mobile"],
  "manual_simulation": ["Every concrete action to click/type/submit/verify."],
  "acceptance": ["Observable pass conditions."],
  "evidence": []
}
```

## Ralph-Style Goal Discipline

Use the linked AI Hero / Ralph Wiggum-style loop as operating discipline, adapted to `/goal`:

- Keep explicit progress in files, not conversation memory.
- Keep every PRD item independently checkable with `passes: false` until proven.
- Work in small loops, but preserve end-to-end context.
- Update the goal evidence after every run.
- Run risky or blocking checks first.
- Let critique create the next batch of focused items.
- Never assume "looks loaded" means "works."
- Never end while a failing PRD item is hidden by a broad summary.

## Append-Only PRD JSON Convention

`/Users/mkh/workspace/fulcrum/.scratch/prd.json` is **NDJSON** (newline-delimited JSON). One PRD item per line. Multiple CLI agents append in parallel; never edit existing lines.

Rules:

- Each agent writes by appending a single JSON line atomically (`>>` redirect; no `jq -i`, no full-file rewrites).
- Dedup, supersede, and `passes: true` flips happen by appending **new** lines that reference the prior id via `supersedes: ["<old-id>"]` or `parents: ["<old-id>"]`. The newest matching line wins on read.
- Dedup passes write entries with `op: "dedup"` and an array of superseded ids. Never delete.
- Status transitions: `proposed → in-progress → landed → verified`. Each transition is a new appended line.
- Agents tag every line with `agent` (e.g. `seed-plane-tasks`, `dedup-pass-001`, `loop-implementer`) and `ts` (ISO-8601 UTC).
- A `read` of `prd.json` always resolves by `id`: newest line per id wins (compare `ts`).

Schema (superset of the minimum item shape already in this file):

```json
{
  "id": "prd-<area>-<short-slug>",
  "type": "feature|workflow|value|component|interaction|recovery|empty-state|copy|overhaul",
  "surface": "web|cli|tui|api|service|cross-cutting",
  "area": "<one of the area buckets>",
  "title": "Concise title",
  "intent": "What user value this delivers, 1–3 sentences.",
  "sources": ["upstream:plane:<path-or-url>", "upstream:docmost:<...>", "phase:09.6:<doc>", "internal:<service>", "competitor:<name>"],
  "acceptance": ["Observable pass conditions."],
  "anti_patterns": ["Explicit failures to avoid."],
  "interactions": [{"selector": "button[data-test=...] or /route or fulcrum <cmd>", "action": "click|type|submit|hover|focus|key|run", "expected": "Observable outcome."}],
  "critique_focus": ["hierarchy", "workflow fit", "empty state", "mobile"],
  "manual_simulation": ["Step 1 …", "Step 2 …"],
  "passes": false,
  "priority": "P0|P1|P2|P3",
  "incentive": "Why the loop should pick this up; what unblocks if landed.",
  "status": "proposed|in-progress|landed|verified|deferred|deduped|superseded",
  "supersedes": ["<old-id>"] ,
  "parents": ["<other-id>"] ,
  "competitor_refs": ["linear:cycles", "shortcut:cfd", "plane:modules"],
  "screens": ["<path>"],
  "evidence": [],
  "tests": ["<test path>"],
  "risk": "Free-form. Especially for overhauls.",
  "op": "create|update|dedup",
  "agent": "<id>",
  "ts": "<ISO-8601 UTC>"
}
```

Omit fields that don't apply. Don't write `null`.

`.scratch/manual-smoke-2026-05-17/findings.ndjson` follows the same append-only rule, schema:

```json
{
  "id": "find-<short-slug>-<ts>",
  "ts": "<ISO-8601 UTC>",
  "surface": "web|cli|tui|api",
  "route_or_command": "<exact path or command>",
  "interaction": "What was clicked/typed/run.",
  "observed": "What actually happened.",
  "expected": "What should have happened.",
  "severity": "blocker|major|minor|polish",
  "category": "ui|ux|logic|workflow|feature|value|copy|a11y|perf|mobile|recovery|empty-state|trace",
  "screenshot": "<path or omit>",
  "log": "<path or omit>",
  "linked_prd": "<prd id or omit>",
  "agent": "<id>"
}
```

## Parallel Subagent Fan-Out (20–30 agents)

To seed `prd.json` deeply, dispatch focused subagents in batches of 6 concurrent calls. Each subagent is assigned **one (area × source)** pair. Areas: dashboard, projects, project-creation, board, docs, doc-editor, planning, acp, review, qa, uat, runs, artifacts, audit, repos, search, settings-routing, settings-connectors, settings-flags, settings-secrets, settings-theme, settings-api, settings-experiments, settings-importers, doctor, inbox, notifications-settings, agents, auth, workflow-cycle, identity, inference, skills, credentials, telemetry, error-logs, dependency-runs, qa-feedback-gate. Sources: `plane`, `docmost`, `plannotator`, `fusion`, `acp-ui`, `phase-09.6` planning docs, internal `services/<svc>`.

Each subagent **must**:

1. Read its assigned upstream clone under `.scratch/upstream-product-replacement/repos/<source>/` for the assigned area — every UI element, route, copy string, settings panel, empty state, error, keyboard shortcut, mobile pattern, accessibility cue.
2. Cross-reference against `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/*` for intended value/workflow/feature from the copy-first parts of the phase.
3. Append PRD entries to `.scratch/prd.json` — one per line, schema above, `status: "proposed"`, `op: "create"`, `agent: "seed-<source>-<area>"`, `passes: false`, with `sources` citing exact files.
4. Cap append at ~30 entries per agent. If the area is empty in the assigned source, append one `type: "value"` PRD describing the gap and what we should add.
5. Append observations to `findings.ndjson` if the research surfaces a feature in copy that we don't yet implement.

Dispatch policy:

- Run subagents in concurrent batches of **6**.
- Run **at least 24 batches** until coverage is broad. Stop when every (area × source) pair has at least one agent or one explicit "empty source" PRD entry.
- After all batches complete, run a **dedup pass agent** that reads `prd.json`, groups by `(surface, area, title)` similarity, appends `op: "dedup"` entries marking obsolete ids `status: "superseded"`, and keeps the strongest entry.

## Total Overhaul Protocol

When a critique surfaces structural failure (navigation, hierarchy, density, copy, mobile, a11y, workflow fit, value), do not patch. Open a `type: "overhaul"` PRD with:

- Current screen problem stated harshly.
- Proposed replacement information architecture.
- New navigation grouping (workflow stages, not feature buckets).
- New empty/error/loading state pattern.
- New copy that names user value, not implementation.
- Acceptance proof: screenshots before/after, focused tests, interaction matrix.
- Risk: explicit named risk + mitigation.

Implement the overhaul as the next loop iteration's primary slice, even if it crosses multiple files. Cite the PRD id in the commit message.

## Closing The Loop

The loop closes only when:

- Every PRD line with newest status `proposed` or `in-progress` for priorities P0/P1/P2 has either landed (`status: "verified"`) or been explicitly deferred with a written reason.
- `findings.ndjson` newest per id has no `severity: blocker` and no `severity: major`.
- `prd.json` line count > 200 with broad coverage across surfaces/areas, and a dedup pass has been recorded.
- Full `bun run ci` green.
- Critique report's latest section enumerates running dev server URLs, screenshot index, PRD totals, findings totals, blockers, polish, exact verification commands.

