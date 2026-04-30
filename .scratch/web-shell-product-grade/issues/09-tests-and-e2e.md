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

Acceptance criteria:
- Vitest + `@testing-library/svelte` set up. Tests for: `active-project` store, `command-palette` filter, project form validation, kanban move helper.
- Playwright e2e flow: open `/`, navigate to `/projects`, create `Demo`, navigate to `/boards`, create `Try the kanban` task in pending column, drag to in_progress, assert it landed, search for "kanban" in cmd+K, click result.
- Playwright runs against a temp `FULCRUM_HOME` directory; teardown wipes it.
- `scripts/ci.ts` adds `web:test` (Vitest) and an opt-in `web:e2e` step gated by `FULCRUM_RUN_E2E=1`.
- All test stages green.
