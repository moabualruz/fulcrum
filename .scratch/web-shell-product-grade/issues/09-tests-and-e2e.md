# 09 — Component tests + e2e smoke

Status: ready-for-agent
Risk tier: low
Severity: medium
Dependencies: 03, 04, 05, 06, 07
File ownership:
- `src/web/vitest.config.ts`
- `src/web/playwright.config.ts`
- `src/web/tests/**`
- `scripts/ci.ts`

TDD plan:
- RED config: `vitest.config.ts` boots with jsdom + `@testing-library/svelte` setup; an empty `_smoke.test.ts` proves the runner works (skipped if zero tests; we always have at least one).
- RED config: `playwright.config.ts` declares the smoke project; `_smoke.spec.ts` opens `/` and asserts the page title contains "Fulcrum".
- RED e2e: `e2e.smoke.spec.ts` runs the user journey (create project → create task → drag → search → toast). Fails before per-feature implementations are wired.
- GREEN: each prior issue (03–07) lands the production code that turns its e2e step green.
- REFACTOR: shared Playwright fixtures (`fulcrumHome`, `seedProject`, `seedTask`).
- CI: `scripts/ci.ts` adds `web:test` (Vitest) always-on; `web:e2e` gated by `FULCRUM_RUN_E2E=1`.

Acceptance criteria:
- Vitest + `@testing-library/svelte` set up. Tests for: `active-project` store, `command-palette` filter, project form validation, kanban move helper.
- Playwright e2e flow: open `/`, navigate to `/projects`, create `Demo`, navigate to `/boards`, create `Try the kanban` task in pending column, drag to in_progress, assert it landed, search for "kanban" in cmd+K, click result.
- Playwright runs against a temp `FULCRUM_HOME` directory; teardown wipes it.
- `scripts/ci.ts` adds `web:test` (Vitest) and an opt-in `web:e2e` step gated by `FULCRUM_RUN_E2E=1`.
- All test stages green.

## Sub-tasks

- [ ] **09.1 — Vitest config + base setup.** Owns: `src/web/vitest.config.ts`, `src/web/tests/setup.ts`. RED: `_smoke.test.ts` runs and exits 0.
- [ ] **09.2 — Playwright config + smoke spec.** Owns: `src/web/playwright.config.ts`, `src/web/tests/e2e/_smoke.spec.ts`. RED: opens `/`, asserts page title contains `Fulcrum`.
- [ ] **09.3 — E2E fixtures.** Owns: `src/web/tests/e2e/fixtures.ts`. RED: `seedProject`, `seedTask`, `seedDoc` helpers boot a temp `FULCRUM_HOME` PGlite, seed rows, and clean up after the test.
- [ ] **09.4 — E2E user journey.** Owns: `src/web/tests/e2e/user-journey.spec.ts`. RED: open `/` → create project → create task → drag to in_progress → search via cmd+K → assert toast.
- [ ] **09.5 — `scripts/ci.ts` adds `web:test` always-on + `web:e2e` opt-in.** Owns: `scripts/ci.ts`. RED: running `bun run ci` includes `web:test`; running with `FULCRUM_RUN_E2E=1 bun run ci` includes `web:e2e`.
- [ ] **09.6 — Update README + `docs/product-kernel.md`.** Owns: `src/web/README.md`, `docs/product-kernel.md`, `docs/product-kernel.original.md`. RED: docs link to the new test commands; recompress so `compress:check` stays green.
