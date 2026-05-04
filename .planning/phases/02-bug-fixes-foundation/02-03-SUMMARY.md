---
phase: 02-bug-fixes-foundation
plan: 03
subsystem: installer-lifecycle
tags: [installer, uninstall, packages, components, safety]
requirements: [BUG-02, BUG-06, BUG-07, BUG-08, BUG-10, BUG-11, BUG-14]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [ownership-safe-cleanup, filesystem-truthful-lifecycle-status]
  affects: [install, uninstall, skills, components, package-parity, vendor-packages]
tech_stack:
  added: []
  patterns: [marker-gated-cleanup, ledger-plus-filesystem-status, package-mirror-metadata]
key_files:
  created:
    - src/cli/claude-plugin-markers.test.ts
  modified:
    - src/cli/claude-plugin-markers.ts
    - src/cli/uninstall.ts
    - src/cli/uninstall.test.ts
    - src/cli/skills.ts
    - src/cli/component.ts
    - src/cli/component.test.ts
    - src/cli/package-parity.ts
    - src/cli/package-parity.test.ts
    - src/cli/vendor-packages.ts
    - src/cli/vendor-packages.test.ts
decisions:
  - Claude plugin cache and marketplace cleanup requires Fulcrum ownership markers before deletion.
  - Component and package status reports filesystem truth alongside ledger state.
  - Loadable package skill mirrors preserve existing non-Fulcrum target skills unless Fulcrum mirror metadata permits replacement.
metrics:
  duration: 39m
  completed_at: 2026-05-04T11:41:55Z
  tasks_completed: 3
  files_changed: 11
---

# Phase 02 Plan 03: Installer Lifecycle Safety Summary

Marker-gated cleanup plus filesystem-truthful package/component lifecycle reporting.

## Completed Tasks

| Task | Name | Commit | Result |
| --- | --- | --- | --- |
| 1 | Add ownership lifecycle RED tests | aa8e30a7 | Added failing contracts for confirmation gates, markerless purge preservation, filesystem status, package parity reasons, and loadable skill collisions. |
| 2 | Gate cleanup by ownership markers | 2ecce7d3 | Preserved markerless Claude plugin cache/marketplace/settings surfaces; removed only Fulcrum-owned surfaces; tightened confirmation messaging. |
| 3 | Use filesystem truth for lifecycle status | 8722149d | Added ledger/native status fields, package missing reasons, and non-overwrite behavior for loadable skill mirrors. |

## Decisions Made

- Claude plugin cleanup now treats `--allow-claude-cli` as permission to run Claude CLI commands, not permission to delete markerless `fulcrum` plugin surfaces.
- Component lifecycle status now returns both `ledgerExists` and `nativeExists`; ledger-only native roots report `missing-native-root`.
- Package parity status now exposes machine-readable `missingReasons` so automation can distinguish ledger drift from missing target files.
- Package skill mirroring now writes `fulcrum-package-mirror.json` metadata and skips existing user/native target skills unless Fulcrum owns that mirror.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Marker-gated authored skill Claude cleanup**
- **Found during:** Task 2
- **Issue:** `removeAuthoredSkills` could remove Claude plugin cache/marketplace paths for `fulcrum` without marker evidence, a related ownership-safety path not explicitly named by the uninstall-only task text.
- **Fix:** Preserve markerless Claude plugin cache/marketplace paths, log `not-owned-by-fulcrum`, and remove only marker-owned dirs.
- **Files modified:** `src/cli/skills.ts`
- **Commit:** 2ecce7d3

## Verification

- RED contracts failed as expected before implementation: 5 lifecycle tests failed across Claude confirmation, uninstall purge, component status, package parity, and vendor package collision handling.
- `bun test src/cli/install.test.ts src/cli/uninstall.test.ts src/cli/claude-plugin-markers.test.ts` passed: 77 pass, 0 fail.
- `bun test src/cli/component.test.ts src/cli/package-parity.test.ts src/cli/vendor-packages.test.ts` passed: 51 pass, 0 fail.
- `bun test src/cli/install.test.ts src/cli/uninstall.test.ts src/cli/component.test.ts src/cli/package-parity.test.ts src/cli/vendor-packages.test.ts` passed: 117 pass, 0 fail.
- `bun run ci` failed in the root test stage: 3619 pass, 2 skip, 256 fail, 1 error. Failures are deferred out-of-scope issues below; install, typecheck, symphony lock, and symphony conformance stages passed before root tests.

## Deferred Issues

- Raw `ProductDb` handles still reach repository APIs that now require MikroORM `EntityManager`, causing broad `repositories.ts: MikroORM EntityManager required` failures in product-kernel, connector, API, CLI, TUI, and search tests.
- Product init and doctor flows still hit missing PGlite schema/ledger state, including `relation "orgs" does not exist`.
- Sprint schema/entity drift remains: migration tables lack entity-returned columns such as `updated_at`, with related `closed_at` drift also observed in prior runs.
- Generated CLI/codegen snapshots remain stale for completion scripts and router artifacts.
- Feature flag registry tests expect 22 flags while runtime now exposes 24.
- Root auth entrypoint tests for `whoami` and `invite` still exit non-zero.

## Known Stubs

None in files created or modified by 02-03.

## Threat Flags

None. Planned threat mitigations were implemented: marker-gated cleanup and explicit Claude CLI confirmation.

## Self-Check: PASSED

- Summary file created at `.planning/phases/02-bug-fixes-foundation/02-03-SUMMARY.md`.
- Task commits found: `aa8e30a7`, `2ecce7d3`, `8722149d`.
- Targeted 02-03 verification passed.
- Full CI failure is documented as deferred out-of-scope work.
