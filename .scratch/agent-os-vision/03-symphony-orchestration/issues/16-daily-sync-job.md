---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 01-submodule-spec-pin, 15-conformance-trace-doc-hash-gate
---

# fulcrum symphony sync --daily: submodule update + drift report + conformance run

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `fulcrum symphony sync [--daily]` CLI command in `src/cli/symphony/sync.ts`:
1. `git submodule update --remote vendor/openai-symphony`.
2. Compare `SPEC.md` SHA against `.symphony-spec.lock`; exit 0 + write "no drift" report if unchanged.
3. If changed: run `difft vendor/openai-symphony/SPEC.md` vs previous commit; capture output; run conformance suite; write drift report to `.fulcrum/reports/symphony-drift-<date>.md`.
4. Exit non-zero if SPEC hash changed.
5. When `FULCRUM_FEATURES=router-llm` ON: append LLM-narrated drift summary from inference sidecar to the report (gated path; skip when flag off).
Expose as graphile-worker daily cron job `symphony:daily-sync` (4 AM local).

## Acceptance criteria
- [ ] Schema / state machine: `.symphony-spec.lock` updated when submodule moves; drift report written to `.fulcrum/reports/`
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: daily cron job registered alongside `symphony:poll` in `jobs/registry.ts`
- [ ] Surfaces (web/cli/tui parity): `fulcrum symphony sync --daily --json` outputs `{driftDetected, reportPath, conformancePassed}`; Web `/orchestration` dashboard shows last sync date + drift status badge; TUI orchestration pane shows last sync timestamp
- [ ] Tests: with unchanged SPEC hash → exits 0, no report; with changed hash → exits non-zero, report file created, conformance suite ran; `--json` output parses correctly
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Sync §Daily Job section mapped to `sync.ts`

## Blocked by
01-submodule-spec-pin, 15-conformance-trace-doc-hash-gate

## Notes
`difft` on PATH (installed via mise). If difft unavailable, fall back to `git diff --unified=5`. Failure gate: if diff reveals >10 changed REQUIRED-section functions, open a local branch `symphony-drift-<date>` and surface to user before auto-merge.
