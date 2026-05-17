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

## PRD Backlog File — Single Source Of Truth

`/Users/mkh/workspace/fulcrum/.scratch/prd.jsonl` is the only PRD glossary. NDJSON, one PRD per line, 1281 entries seeded from upstream clones (plane, docmost, fusion, plannotator, acp-ui), `.planning/phases/09.6-*`, and the internal repo. Seed history lives in commit `df7852157`; do not reseed.

Open the file at the start of every loop iteration. Resolve current state by reading the line for each PRD id; if multiple lines share an id, the newest `ts` wins. The `passes` field is the live progress signal — flip it to `true` only when current smoke evidence, screenshots, logs, focused tests, and the loop's own critique all prove the PRD's acceptance.

Schema (use only fields that apply; never write `null`):

```json
{
  "id": "prd-<area>-<short-slug>",
  "type": "feature|workflow|value|component|interaction|recovery|empty-state|copy|overhaul",
  "surface": "web|cli|tui|api|service|cross-cutting|desktop|canvas",
  "area": "<area bucket>",
  "title": "Concise title",
  "intent": "What user value this delivers, 1–3 sentences.",
  "sources": ["upstream:plane:<path>", "phase:09.6:<doc>", "internal:<service>", "competitor:<name>"],
  "acceptance": ["Observable pass conditions."],
  "anti_patterns": ["Explicit failures to avoid."],
  "interactions": [{"selector": "/route or fulcrum <cmd> or button[data-test=...]", "action": "click|type|submit|hover|focus|key|run", "expected": "Observable outcome."}],
  "critique_focus": ["hierarchy", "workflow fit", "empty state", "mobile"],
  "manual_simulation": ["Step 1 …", "Step 2 …"],
  "passes": false,
  "priority": "P0|P1|P2|P3",
  "incentive": "Why the loop should pick this up; what unblocks if landed.",
  "status": "proposed|in-progress|landed|verified|deferred|unclear|superseded",
  "supersedes": ["<old-id>"],
  "parents": ["<other-id>"],
  "competitor_refs": ["linear:cycles", "plane:modules"],
  "screens": ["<path>"],
  "evidence": ["<path or trace ID>"],
  "tests": ["<test path>"],
  "risk": "Free-form. Especially for overhauls.",
  "merged_from": [{"id": "<contributor-id>", "source_path": "<path>", "agent": "<id>", "ts": "<ts>"}],
  "agent": "<id>",
  "ts": "<ISO-8601 UTC>"
}
```

Findings sidecar `.scratch/manual-smoke-2026-05-17/findings.ndjson` (append-only) keeps a parallel log of every observed failure during simulation:

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

## Ralph-Wiggum Discipline Adapted To `/goal`

Reference: https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum — adopt the 11-tip discipline, but drive it through `/goal` (this file is the durable loop instruction; `/goal` reads it every turn) instead of `ralph.sh`. The mapping below is binding.

### 1. The loop is `/goal`, not a shell script

This goal file replaces `ralph.sh`. Every turn the agent runs reads this file plus `.scratch/prd.jsonl` plus `findings.ndjson` and decides the next single PRD to work on. `/goal` re-enters the loop until the closing gates hold. **No second shell loop needed.** The Stop hook is the iteration boundary.

### 2. HITL first, AFK later

Start every new operating mode in human-in-the-loop. Watch the first iteration, verify the PRD that was picked is actually the highest-leverage P0/P1, verify the acceptance criteria are honest, only then trust the loop to run unattended. Match Ralph: "HITL Ralph resembles pair programming … AFK Ralph unlocks real leverage" — but flip the trust gate only after one good HITL pass.

### 3. Scope is `.scratch/prd.jsonl`

Anthropic-style PRD items with a `passes` field are the canonical scope. The agent must not invent new scope mid-loop unless a critique discovers genuinely missing value — and then the new PRD line must be appended (not inserted) with `parents: [...]` pointing back to whatever prompted it. Vague scope kills loops; the file IS the stop condition.

### 4. Track progress in files, not chat

Two progress files:

- **`.scratch/prd.jsonl`** — flip `passes: true` plus append `evidence`, `screens`, `tests`, and `agent`/`ts` on the existing line. Allowed in-place edit; this is the operational truth.
- **`.scratch/manual-smoke-2026-05-17/2026-05-17-manual-smoke-critique.md`** — append a dated remediation pass each loop iteration with: PRD ids touched, fixed blockers, fresh blockers, evidence paths, exact verification commands. **Never rewrite past passes; only append new ones.** This is the human-readable equivalent of Ralph's `progress.txt`, but committed.

Commit after every meaningful iteration. Future iterations read the commit log to skip exploration.

### 5. Feedback loops are the speed limit

Before flipping any PRD to `passes: true`:

- Run the focused tests it names (`tests` array).
- Run the manual simulation it names (`manual_simulation` array).
- Hit the API endpoint, the CLI command, the web route, the TUI key — exactly as `interactions` describe.
- Capture screenshot + log + trace ID in `evidence`.
- Run `bun run ci` at the close of each batch of related PRDs.

A PRD cannot be `verified` without those artifacts on disk. "Looks loaded" is not evidence.

### 6. Take small steps

One PRD per iteration. Avoid multi-PRD batches except when an overhaul (see below) genuinely spans them. If a PRD feels too large, split it before starting — append child PRD lines with `parents: ["<this-id>"]`. Bias toward many tight commits over one giant commit. Quality > speed, especially when an iteration runs unattended.

### 7. Prioritize risky work first

Selection order each iteration:

1. P0 boot/runtime blockers.
2. Architectural decisions and cross-cutting trace/audit/agent-native-parity issues.
3. Integration points between modules (web ↔ API ↔ service ↔ CLI ↔ TUI parity).
4. Unknown unknowns and spikes surfaced by the current critique.
5. P1 standard workflow value.
6. P2 harsh UX/UI/design remediation including overhauls.
7. P3 polish + quick wins.

When two PRDs tie on priority, pick the one whose acceptance is hardest to fake. Save easy wins for last.

### 8. Quality bar is production

This repo is a **local-first Agent OS**, not a prototype. Production rules apply: TypeORM only, NestJS-native server, Zod for validation, no `.sql` migrations, no `class-validator`, responsibility-named modules, agent-native parity (every UI action also reachable via API + CLI + TUI). Repeat these inside the loop's reasoning every iteration; the codebase wins over the prompt, so verify the actual code matches the rules and fix drift you discover.

### 9. Sandbox + safety

`/goal` runs against a real working tree, not a Docker sandbox. The safety equivalent here:

- Never run `git push --force`, `git reset --hard`, `rm -rf`, `DROP TABLE`, or destructive migrations without explicit user confirmation in the same turn.
- Preserve `.scratch/upstream-product-replacement/` ignored upstream clones — never delete.
- Move corrupted PGlite data dirs aside (`pglite.data.<reason>-<ts>`) instead of deleting.
- Append-only for `prd.jsonl` history and `findings.ndjson`. In-place flips to `passes` are allowed; deletions of past entries are not.

### 10. Cost discipline

Each iteration should pay for itself in PRDs verified, blockers fixed, or evidence captured. Aim for visible movement on at least one P0/P1/P2 PRD per loop turn. If a turn produces no verifiable progress, treat it as a smell and surface why before the next turn.

### 11. Make the loop your own (alternative loop types)

Beyond the headline manual-simulation loop, these specialized loops are first-class — each picks a different selection rule on top of the same PRD file. Use `/goal` to run any of them as long as the closing gates still hold for the headline goal.

- **Coverage loop** — pick PRDs whose `tests` array is empty or whose `passes` is false because of missing test evidence. Goal: every PRD has at least one focused test path before it can verify.
- **Linting / typecheck loop** — pick PRDs blocked by lint, typecheck, or `bun run lint:boundaries`. One fix per iteration; rerun the gate after.
- **Duplication / entropy loop** — pick PRDs flagged as duplicated logic or stale code (`type: "overhaul"` candidates that surfaced via `findings.ndjson` `category: "logic"`).
- **Trace-spine loop** — pick PRDs in `surface: "cross-cutting"` `area: "observability"` and prove trace IDs propagate across every surface end-to-end.
- **Mobile loop** — pick PRDs with `critique_focus` including `"mobile"`; run desktop + mobile screenshots side-by-side.

Switch between loops by re-running `/goal` after telling the agent which selection rule to use this turn; the goal file and PRD file stay constant.

## Total Overhaul Protocol

When a critique surfaces structural failure (navigation, hierarchy, density, copy, mobile, a11y, workflow fit, value), **propose an overhaul, do not patch**. Append a new PRD line with `type: "overhaul"`, `priority: "P1"` or higher, and:

- Current screen problem stated harshly.
- Proposed replacement information architecture.
- New navigation grouping (workflow stages, not feature buckets).
- New empty/error/loading state pattern.
- New copy that names user value, not implementation.
- Acceptance proof requirement: screenshots before/after, focused tests, interaction matrix.
- `risk`: explicit named risk + mitigation.
- `parents`: ids of the patched PRDs being superseded.

Implement the overhaul as the next loop iteration's primary slice, even if it crosses multiple files. Cite the PRD id in the commit message and on the patched PRDs flip `status: "superseded"`.

## Closing The Loop

The loop closes only when **all** of these hold:

- Every PRD with `passes: false` and `priority: "P0"` has either flipped to `passes: true` with evidence or been explicitly deferred with a written reason on the line.
- No PRD with `priority: "P1"` carries an unresolved blocker — either `passes: true` or recorded as polish in the critique.
- `findings.ndjson` has no open `severity: "blocker"` and no `severity: "major"`.
- `bun run ci` is green.
- Critique report's latest section enumerates running dev server URLs, screenshot index, PRD totals (passes/failed/unclear), findings totals, blockers, polish, exact verification commands, and trace IDs for the canonical workflow proof.
- The dev servers are left running for human review.

`promise>COMPLETE</promise>` is signalled in the critique report's most recent "Status" line: `Status: COMPLETE — closing gates all met.` The Stop hook clears once that line is present and every closing gate above resolves true on re-read.

