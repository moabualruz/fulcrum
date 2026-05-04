---
status: resolved
trigger: "Fix Phase 2 completion blockers: root bun run ci fails because many tests/runtime paths still pass raw ProductDb into repositories requiring MikroORM EntityManager; verify/fix graphile-worker runtime bootstrap; fix public API parity 404 failures; fix missing root @playwright/test for a11y audit. Goal: bun run ci passes, then re-run Phase 2 verifier."
created: "2026-05-04"
updated: "2026-05-04"
---

# Debug Session: fix-phase-2-completion-blockers

## Symptoms

- expected_behavior: "Root bun run ci passes, then Phase 2 verifier passes."
- actual_behavior: "Phase 2 implementation completed all plans, but root bun run ci fails and verifier returns FAIL."
- error_messages: "repositories.ts: MikroORM EntityManager required. Pass em (from MikroORM) instead of raw ProductDb. See ARCH-02 migration guide.; public API parity 404 failures; tests/a11y/accessibility-audit.test.ts cannot find module @playwright/test; graphile-worker runtime bootstrap not proven."
- timeline: "Started after executing Phase 2 on 2026-05-04."
- reproduction: "Run bun run ci from /Users/mkh/workspace/fulcrum."

## Current Focus

- hypothesis: "Phase 2 blockers are independent CI failures, with ProductDb-to-EntityManager migration fallout as dominant failure source."
- test: "bun run ci"
- expecting: "Root CI exits 0 and Phase 2 verifier can pass."
- next_action: "closed"
- reasoning_checkpoint: "ProductDb compatibility had to be fixed at service/runtime boundaries without reverting the Phase 1 EntityManager repository contract."
- tdd_checkpoint: "Focused failing paths were fixed and root CI was re-run successfully."

## Evidence

## Eliminated

## Resolution

- root_cause: "Raw ProductDb compatibility gaps remained in runtime/test paths after repositories moved to MikroORM EntityManager; public API task PATCH/DELETE lacked ProductDb service branches; a11y audit imported Playwright at module load from root Bun tests; web build surfaced Svelte/SvelteKit compile errors; worker registry evidence needed final CI coverage."
- fix: "Added ProductDb branches for task update/delete, routed product CLI through canonical DB resolver, fixed public OpenAPI/static API routing, made a11y audit imports conditional, added root Playwright/a11y deps, repaired web compile issues, guarded optional/browser-server imports, and added Phase 2 verification artifact."
- verification: "Passed focused blocker commands and final root `bun run ci`; wrote `.planning/phases/02-bug-fixes-foundation/02-VERIFICATION.md` with status `passed`."
- files_changed: "See git diff; includes service/runtime fixes, web build fixes, a11y audit guard, CI memory setting, and GSD verification artifacts."
