---
phase: 04-inference-router-skills
plan: 07
subsystem: web-ui
tags: [routing, inference, svelte, sveltekit, tabs, web, backend-status, dimensions]
requires:
  - phase: 04-06
    provides: Shared tRPC routing drafts, test, config.updateLlmGate procedures
  - phase: 04-03
    provides: InferenceService, backend probes, probeConfiguredBackends
provides:
  - Five-tab routing editor (Rules, Drafts, Test, LLM Gate, Evidence)
  - Web server actions for routing.test, drafts.* CRUD, and updateLlmGate
  - Backend status rows (Embedded, Ollama, LM Studio, OpenAI-compatible)
  - Dimension mismatch banner with exact UI-SPEC copy
affects: [04-08]
tech-stack:
  added: []
  patterns:
    - "Tabs-in-Svelte pattern: sibling <button> elements with activeTab state and {#if} section switching"
    - "Server action proxy pattern: Web form actions call tRPC procedures via trpcGet/trpcPost"
    - "Backend status row with status dot + text label — never color-only"
    - "Env-var-based LLM gate config reading via getLlmGateConfig() helper"
key-files:
  created: []
  modified:
    - src/web/src/routes/settings/routing/routing.types.ts
    - src/web/src/routes/settings/routing/routing.server.ts
    - src/web/src/routes/settings/routing/RoutingPage.svelte
    - src/web/src/routes/inference/+page.server.ts
    - src/web/src/routes/inference/+page.svelte
    - src/web/src/routes/inference/page.server.test.ts
    - src/web/src/routes/settings/routing/page.server.test.ts
    - src/web/tests/vitest/routing-route.test.ts
key-decisions:
  - "LLM gate config read from process.env in server action (no tRPC getter needed) — simpler than adding a shared tRPC procedure since config is derived from env vars"
  - "Backend status rows constructed in load function via mapBackendsToStatusRows() — keeps server-side responsibility for data shaping"
  - "Inactive tab content not rendered via {#if} blocks — avoids SSR rendering cost for hidden sections"
requirements-completed: [RTR-06, RTR-08, INF-03, INF-04, INF-05]
duration: 11min
completed: 2026-05-05
---

# Phase 04 Plan 07: Web Routing/Inference Operational UX Summary

**Table-first Web routing editor with five operational tabs, tRPC-proxied server actions for drafts/test/LLM gate, and inference backend status rows with probe states and dimension mismatch banner.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-05T04:40:12Z
- **Completed:** 2026-05-05T04:51:48Z
- **Tasks:** 2 (both TDD: 2 commits total)
- **Tests:** Routing server: 15/15 pass, Vitest routing: 8/8 pass, Inference: 4/4 pass

## Accomplishments

- **Task 1 (TDD):** Upgraded Web routing editor from single-panel to five-tab layout
  - `Rules` tab: full rules table with all 10 columns (Priority, Name, Scope, Source, Conditions, Agent, Skill set, Status, Updated, Actions) plus inherited rules section
  - `Drafts` tab: drafts table with Draft ID, Proposed rule, Source, Confidence, Conflict state, Matching active rules, Created, Actions — with `Approve draft` button (review_needed only) and `Delete` for all states
  - `Test` tab: existing dry-run form plus enriched result display
  - `LLM Gate` tab: enable toggle + input mode selector (full_context / task_plus_history / task_facts) with save action
  - `Evidence` tab: routing decision detail with status, matched rule, facts used, evidence list, why-unmatched alert, backend/model
  - Builder/Raw JSON toggle above create panel
  - Six new server actions: `test`, `draftList`, `draftApprove`, `draftDelete`, `draftUpdate`, `updateLlmGate`

- **Task 2 (TDD):** Added backend status and dimension state to Web inference dashboard
  - Backend status table with rows for Embedded, Ollama, LM Studio, OpenAI-compatible
  - Columns: Backend, Status (dot + label), Reason, Model, Embed probe, Generate probe, Dimensions, Actions
  - `Start` action for embedded; `Probe` button for external backends
  - Dimension mismatch banner with exact UI-SPEC copy when degraded status detected
  - Backend status data served via `InferenceDashboardData.backendRows` — robust fallback when sidecar unreachable

## Task Commits

Each task committed atomically after TDD RED/GREEN implementation:

1. **Task 1: Upgrade Web routing editor** — `4639eb15` (feat)
   - routing.types.ts: added DraftRow, EnrichedDecisionRow, LlmGateConfig, BackendStatusRow, DimensionMismatchInfo types
   - routing.server.ts: added test, draftList, draftApprove, draftDelete, draftUpdate, updateLlmGate actions; updated loadRoutingPage to return drafts + llmGateConfig
   - RoutingPage.svelte: complete rewrite with five-tab structure, builder/raw toggle, enriched evidence display
   - page.server.test.ts: 7 new test suites for new actions (15 total, all passing)
   - routing-route.test.ts (vitest): 4 new tests for tabs, drafts, evidence, builder/raw toggle (8 total, all passing)

2. **Task 2: Add backend status to inference dashboard** — `1331814d` (feat)
   - inference/+page.server.ts: added BackendStatusRow interface, mapBackendsToStatusRows(), backendRows to InferenceDashboardData
   - inference/+page.svelte: added backend status table section, dimension mismatch banner, probe/start actions
   - inference/page.server.test.ts: updated assertions for backendRows, added degraded status test

## Files Created/Modified

### Modified
- `src/web/src/routes/settings/routing/routing.types.ts` — New types: DraftRow, EnrichedDecisionRow, LlmGateConfig, BackendStatusRow, DimensionMismatchInfo
- `src/web/src/routes/settings/routing/routing.server.ts` — New server actions (test, draft*, updateLlmGate) + enriched load function
- `src/web/src/routes/settings/routing/RoutingPage.svelte` — Complete rewrite with five-tab structure
- `src/web/src/routes/inference/+page.server.ts` — Added backend status data to inference dashboard
- `src/web/src/routes/inference/+page.svelte` — Added backend status table + dimension mismatch banner
- `src/web/src/routes/inference/page.server.test.ts` — Updated for backendRows assertions
- `src/web/src/routes/settings/routing/page.server.test.ts` — 7 new server action test suites
- `src/web/tests/vitest/routing-route.test.ts` — 4 new component tests

## Decisions Made

- **LLM gate config from env vars:** Rather than adding a `routing.config.getLlmGate` tRPC procedure (which would modify the shared routing layer), the Web load function reads `FULCRUM_FEATURES` and `FULCRUM_LLM_INPUT_MODE` env vars directly via a `getLlmGateConfig()` helper. This keeps the shared layer unchanged.

- **Backend status constructed in load function:** The `mapBackendsToStatusRows()` helper in `inference/+page.server.ts` creates typed `BackendStatusRow[]` from the raw health response. This keeps data-shaping logic in the server layer and provides robust defaults (all four backends always returned, even when sidecar is down).

- **Tab content through {#if} blocks:** Each tab section is wrapped in `{#if activeTab === "rules|drafts|test|llm-gate|evidence"}`. Inactive tabs are not rendered in SSR, saving bandwidth. Tab switching re-renders visible section.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing bun + Svelte 5 incompatibility:** The `page.svelte.test.ts` files (bun test) fail to render Svelte 5 components (`component is not a function`). This is a pre-existing issue where bun's test runner doesn't apply the Svelte compiler plugin. The correct test path uses vitest (`tests/vitest/`), which has the Svelte vite plugin configured in `vitest.config.ts`. All 8 new vitest component tests pass.

- **Pre-existing mock isolation issue:** Running inference and settings/inference tests together in the same `bun test` command causes mock.module leaks. Tests pass when run individually (4/4 and 3/3).

## TDD Gate Compliance

| Plan | Task | RED | GREEN | REFACTOR | Status |
|------|------|-----|-------|----------|--------|
| 04-07 | Task 1 |  ✓  |   ✓   |    —     | Pass |
| 04-07 | Task 2 |  ✓  |   ✓   |    —     | Pass |

Note: RED phase was not committed as a separate commit — tests were written first, then implementation committed in a single commit per task. TDD discipline was followed (tests before code) but without the intermediate RED commit.

## Next Phase Readiness

- Routing editor fully operational with tRPC-backed actions for all five tabs
- Inference dashboard shows backend status for all four provider types with probe states
- All 5 requirements (RTR-06, RTR-08, INF-03, INF-04, INF-05) completed
- Ready for 04-08 plan execution (final phase 04 plan)

## Self-Check: PASSED

- Commits verified:
  - `4639eb15` (Task 1): Web routing editor upgrade — FOUND
  - `1331814d` (Task 2): Inference backend status — FOUND
- Routing server tests: 15/15 passing
- Inference server tests: 4/4 passing
- Settings inference server tests: 3/3 passing
- Vitest routing component tests: 8/8 passing
- All acceptance criteria grep checks pass

---

*Phase: 04-inference-router-skills*
*Completed: 2026-05-05*
