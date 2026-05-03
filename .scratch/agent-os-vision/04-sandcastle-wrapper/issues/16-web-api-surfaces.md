---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 15-fulcrum-agents-runs-cli-doctor
---

# Web + API surfaces: agents registry page + run detail tabs

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Build the SvelteKit pages and tRPC procedures for this pillar's Web surface. `/agents` — profile registry table (name, cliPath, last-tested badge, test button); clicking test calls `agents.testProfile` mutation; badge updates reactively. `/agents/[name]` — profile detail: CLI path, flags, auth env vars (masked), run history list. `/projects/[id]/runs` — extend existing list with `agent_name`, `sandbox_mode` chip, `iteration_count` columns. `/projects/[id]/runs/[runId]` — tabbed detail: Summary | Transcript (paginated JSONL renderer, collapsible turns) | Diff (syntax-highlighted) | Artifacts (download). SSE live transcript stream when `real-time-collab-server` flag on; 2s poll fallback always-on.

## Acceptance criteria

- [ ] Adapter / profile: all tRPC procedures wired: `agents.listProfiles`, `agents.getProfile`, `agents.testProfile` mutation, `agents.upsertProfile` mutation, `runs.list`, `runs.get`, `runs.cancel` mutation, `runs.retry` mutation, `runs.getLogs` paginated, `runs.streamLogs` async-generator subscription, `runs.listArtifacts`, `runs.getWorkspaceDiff`.
- [ ] Lifecycle integration: `/agents` test button calls `testProfile` mutation and updates `test_passed` badge without page reload; `/runs/[runId]` Transcript tab paginates JSONL (`runs.getLogs` cursor-based); live tail uses SSE when `real-time-collab-server` on, 2s `setInterval` poll fallback when off.
- [ ] Surfaces parity: Transcript tab renders each JSONL turn as a collapsible block (timestamp + stream label + text); Diff tab syntax-highlights the `.diff` file; Artifacts tab lists files with filename, size, MIME and download link; cancel/retry buttons on Summary tab call mutations and reflect new state.
- [ ] Tests: Playwright e2e test — navigate to `/agents`, click test on `claude-code`, assert badge changes; navigate to a run detail page, assert all four tabs render; cancel button visible and calls cancel mutation (mock); Artifacts tab shows download links for a seeded artifact row.
- [ ] Tests: tRPC procedure unit tests — `agents.listProfiles` returns seeded profiles; `runs.getLogs` paginates correctly against a fixture JSONL file.

## Blocked by

15-fulcrum-agents-runs-cli-doctor

## Notes

Auth env var masking: display only last 4 chars (e.g. `ANTHROPIC_API_KEY: ****abcd`). Never expose full value in any surface. The `/projects/[id]/runs` page may already exist from Pillar 3 (Symphony) — extend it, do not duplicate. SSE subscription (`runs.streamLogs`) is behind `FULCRUM_FEATURES=real-time-collab-server`; the 2s poll path using `runs.getLogs` is always-on.
