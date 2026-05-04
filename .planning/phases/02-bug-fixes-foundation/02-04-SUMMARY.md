---
phase: 02-bug-fixes-foundation
plan: 04
subsystem: config-frontmatter-patching
tags: [frontmatter, config, installer, rules, byte-stability]

requires:
  - phase: 02-bug-fixes-foundation
    provides: [installer lifecycle safety, package ownership markers]
provides:
  - byte-stable frontmatter scalar patching
  - ownership-gated JSON and TOML config patching
  - sentinel block replacement that preserves unowned bytes
affects: [install, rules, docs-frontmatter, config-files]

tech-stack:
  added: []
  patterns: [targeted-patchers, ownership-markers, sentinel-byte-preservation]

key-files:
  created:
    - src/utils/frontmatter.ts
    - src/utils/config-patcher.ts
    - src/cli/vendor-rules.ts
  modified:
    - src/cli/install.ts
    - tests/docs/frontmatter-schemas.test.ts
    - src/cli/install.test.ts
    - src/cli/vendor-rules.test.ts

key-decisions:
  - "Targeted patchers preserve unowned bytes instead of reserializing whole files."
  - "Config mutation requires explicit Fulcrum ownership markers before changing existing JSON/TOML keys."
  - "Fulcrum sentinel replacement is centralized so content outside the sentinel block remains byte-identical."

patterns-established:
  - "Byte-stable patch helpers update only owned or targeted regions."
  - "Installer config writes refuse unowned keys once ownership markers exist."

requirements-completed: [BUG-05, BUG-13]

duration: 58min
completed: 2026-05-04
---

# Phase 02 Plan 04: Byte-Stable Config Patching Summary

**Targeted frontmatter, JSON, TOML, and sentinel patchers that preserve user-owned file bytes during install/config updates.**

## Performance

- **Duration:** 58 min
- **Started:** 2026-05-04T11:03:00Z
- **Completed:** 2026-05-04T12:01:57Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added RED byte-stability contracts for frontmatter, Codex TOML config, Caveman JSON config, and Fulcrum rules sentinel updates.
- Added `patchFrontmatterKey`, `patchJsonOwnedKey`, `patchTomlOwnedKey`, and `replaceSentinelBlock` helpers.
- Rewired installer mutation paths to use targeted patchers where ownership markers or sentinel bounds make the write safe.

## Task Commits

1. **Task 1: Add RED byte-stability tests** - `7bbbb956` (test)
2. **Task 2: Implement targeted patch helpers** - `24043242` (feat)

## Files Created/Modified

- `src/utils/frontmatter.ts` - Byte-stable scalar frontmatter key update/insert helper.
- `src/utils/config-patcher.ts` - Ownership-gated JSON and TOML targeted patch helpers.
- `src/cli/vendor-rules.ts` - Shared Fulcrum sentinel replacement helper.
- `src/cli/install.ts` - Installer now routes owned config and rules changes through targeted patchers.
- `tests/docs/frontmatter-schemas.test.ts` - Frontmatter byte-preservation contracts.
- `src/cli/install.test.ts` - JSON/TOML ownership patching and installer preservation contracts.
- `src/cli/vendor-rules.test.ts` - Sentinel replacement byte-preservation contracts.

## Decisions Made

- Targeted helpers intentionally support the scalar/top-level cases required by this plan instead of becoming general YAML/JSON/TOML formatters.
- Existing config files without Fulcrum ownership markers keep legacy bootstrap behavior; once markers exist, writes are constrained to owned keys.
- Sentinel replacement remains plain string-bounded because Fulcrum owns only the sentinel body, not surrounding user content.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- RED: `bun test tests/docs/frontmatter-schemas.test.ts src/cli/install.test.ts src/cli/vendor-rules.test.ts` failed as expected before implementation with missing helper modules.
- GREEN targeted tests: `bun test tests/docs/frontmatter-schemas.test.ts src/cli/install.test.ts src/cli/vendor-rules.test.ts` passed: `77 pass, 0 fail`.
- Lint: `bun run lint` passed.
- Acceptance grep: `rg "JSON\\.stringify\\([^\\n]+, null, 2\\)|yaml\\.stringify|YAML\\.stringify" src/cli/install.ts src/utils src/cli/vendor-rules.ts` returned no matches.
- Full CI: `bun run ci` failed in the pre-existing root test baseline: `3626 pass`, `2 skip`, `256 fail`, `1 error`.

## Deferred Issues

- Broad product-kernel tests still pass raw `ProductDb` into repository helpers that now require MikroORM `EntityManager`.
- Several CLI/product init tests still fail around local DB/migration ledger initialization and missing `orgs` schema state.
- Generated CLI artifacts are stale: `scripts/ci/codegen.ts` reports changed generated files (`memory.ts`, `notifications.ts`, `runs.ts`, `search.ts`, `skills.ts`).
- Static shell completions do not match runtime generation and expected domain naming.
- REST parity tests still expect unimplemented/mismatched public API routes and OpenAPI paths.
- `tests/a11y/accessibility-audit.test.ts` cannot import `@playwright/test`.
- Feature flag contract tests still expect 22 flags while runtime exposes 24.

## Known Stubs

None in files created or modified by this plan.

## Threat Flags

None. Existing threat mitigation T-02-07 is covered by ownership-gated config patching and sentinel-only replacement.

## Issues Encountered

Full CI remains red due unrelated baseline failures. Targeted plan tests and lint passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Byte-stable patching is ready for later installer/config work. Follow-up phases can replace remaining whole-file config rewrites by extending the targeted helper coverage when the target key shape is explicitly owned.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/02-bug-fixes-foundation/02-04-SUMMARY.md`
- Task commits found: `7bbbb956`, `24043242`
- No unexpected tracked deletions were introduced by task commits.

---
*Phase: 02-bug-fixes-foundation*
*Completed: 2026-05-04*
