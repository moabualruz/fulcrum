---
phase: 08-surface-delivery
plan: 2
subsystem: cli-surface
tags: [cli, json, completion, parity]
requires: [08-01]
provides: [CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07]
affects: [src/index.ts, src/cli/index.ts, src/cli/commands, src/cli/completion.ts]
tech_stack:
  added: []
  patterns: [Bun CLI, local tRPC caller, JSON machine output, shell completion]
key_files:
  created:
    - src/cli/commands/artifacts.ts
    - src/cli/commands/doctor.ts
    - src/cli/commands/projects.ts
    - src/cli/commands/sprints.ts
    - src/cli/commands/tasks.ts
  modified:
    - src/index.ts
    - src/cli/index.ts
    - src/cli/local-caller.ts
    - src/cli/completion.ts
    - src/cli/commands/memory.ts
    - src/cli/commands/pillar14-generated.ts
    - src/cli/commands/routing.ts
    - src/cli/commands/search.ts
    - src/cli/__tests__/phase08-cli-parity.test.ts
decisions:
  - "Keep existing Bun CLI architecture and add domain dispatch cases instead of adopting a CLI framework."
  - "Use local tRPC callers with active seeded CLI session context for parity commands."
  - "Expose shell completion as fulcrum completion --shell bash|zsh|fish|powershell."
metrics:
  duration: "about 55 minutes"
  completed: "2026-05-06T00:35:00Z"
  tasks: 3
  commits: 3
---

# Phase 08 Plan 02: CLI Surface Parity Summary

Universal CLI parity wiring now covers required Phase 08 domains, parseable `--json` output, and shell completion scripts.

## Completed Tasks

| Task | Name | Commit | Result |
|---|---|---|---|
| 1 | RED CLI dispatch and JSON tests | 58dd1d01 | Added failing parity tests for exact required commands and JSON parsing. |
| 2 | Wire missing CLI domains through local caller | e5a7c751 | Added projects/tasks/sprints/memory/search/artifacts/components/doctor dispatch and local tRPC command wrappers. |
| 3 | Add completion command and binary smoke | ac10365c | Added unsupported-shell completion coverage and verified supported shell scripts plus build. |

## Verification

- `bun test src/cli/__tests__/phase08-cli-parity.test.ts` — 17 pass, 0 fail.
- `bun run build` — passed, produced `dist/fulcrum-darwin-arm64`.
- `rg -n "case \"tasks\"|case \"sprints\"|case \"memory\"|case \"search\"|case \"artifacts\"|case \"doctor\"|case \"components\"" src/cli/index.ts` — required cases present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed memory CLI router key**
- **Found during:** Task 2
- **Issue:** `src/cli/commands/memory.ts` expected `caller.memory`, but `appRouter` exposes `memories`.
- **Fix:** Switched command calls to `caller.memories` and aligned search input to `term`.
- **Files modified:** `src/cli/commands/memory.ts`
- **Commit:** e5a7c751

**2. [Rule 1 - Bug] Fixed runs CLI tRPC path**
- **Found during:** Task 2
- **Issue:** generated runs command called unmounted `runs.*` paths.
- **Fix:** Routed list/show/cancel/retry through mounted `agent_runs.*` procedures.
- **Files modified:** `src/cli/commands/pillar14-generated.ts`
- **Commit:** e5a7c751

**3. [Rule 1 - Bug] Fixed routing CLI session lookup**
- **Found during:** Task 2
- **Issue:** routing CLI queried legacy `session`/`user` table names and used global EntityManager context.
- **Fix:** Updated lookup to `sessions`/`users` and forked request EntityManager with a request container.
- **Files modified:** `src/cli/commands/routing.ts`
- **Commit:** e5a7c751

**4. [Rule 2 - Critical functionality] Added reusable local caller session context**
- **Found during:** Task 2
- **Issue:** new domain commands needed authenticated local tRPC context with active CLI session and request-scoped EM.
- **Fix:** Extended `src/cli/local-caller.ts` to build session-aware local callers from CLI containers.
- **Files modified:** `src/cli/local-caller.ts`
- **Commit:** e5a7c751

**5. [Rule 3 - Blocking issue] Kept empty notification list parseable**
- **Found during:** Task 2 verification
- **Issue:** `notify list --json` failed in isolated CLI smoke DB when notification entity metadata was unavailable.
- **Fix:** Returned `[]` for that empty-store metadata case while preserving other errors.
- **Files modified:** `src/cli/commands/pillar14-generated.ts`
- **Commit:** e5a7c751

## Known Stubs

None blocking this plan. Existing generated `src/cli/generated/*` "not wired yet" files remain outside runtime paths covered by this plan.

## Threat Flags

None. This plan changed CLI/tRPC dispatch paths and did not introduce new network endpoints, file access trust boundaries, or schema changes.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/08-surface-delivery/08-02-SUMMARY.md`
- Commits verified in git history: `58dd1d01`, `e5a7c751`, `ac10365c`
- Required tests and build smoke passed.
