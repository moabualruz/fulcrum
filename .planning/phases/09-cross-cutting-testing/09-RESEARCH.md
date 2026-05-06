# Phase 09: Cross-Cutting + Testing - Research

**Researched:** 2026-05-06  
**Status:** Complete  
**Inputs:** `09-RESEARCH-PLATFORMS.md`, `09-RESEARCH-DEPENDENCIES.md`, `09-RESEARCH-INTEGRATION.md`, `09-CONTEXT.md`.

## Executive Summary

Phase 09 should be planned as a hardening + parity + coverage phase. The codebase already contains primitives for most XCT requirements: i18n adapter/catalogs, theme router, telemetry/error routers, backup/import/export routers, local vault/keyring, audit router, a11y tests, broad CLI/TUI/Web tests, and local CI. Planning should not rebuild these systems. It should turn existing primitives into verified, maximum-parity, locally tested product surfaces.

## Core Findings

1. **Maximum parity must be explicit.** Each cross-cutting capability needs Web, CLI, TUI, and API/tRPC behavior documented and tested. Phase 08 already established parity discipline; Phase 09 applies it to platform features.
2. **Existing code is reusable.** `src/i18n`, `themeRouter`, `telemetryRouter`, `backupRouter`, `json-import-export`, `secrets`, `auditRouter`, `scripts/ci.ts`, and `src/web/tests/a11y` should be extended.
3. **Dependencies should stay minimal.** Add only `@vitest/coverage-v8@4.1.5` for web coverage and optionally `@opentelemetry/api@1.9.1` if instrumentation needs a stable facade. Avoid Sentry SDKs, hosted coverage, and broad i18n rewrites.
4. **Backup runner has a known gap.** `backupRouter` can dump/restore database rows, but `src/backup/runner.ts` still writes a stub manifest archive. Phase 09 must converge these.
5. **Coverage is split.** Root tests use Bun; web tests use Vitest/Playwright. TST-08 needs both Bun coverage threshold and Vitest coverage threshold.
6. **A11y requires more than axe.** `@axe-core/playwright` should cover WCAG 2.1 AA route sweeps, while keyboard/focus/label/high-contrast assertions cover gaps automated axe cannot detect.

## Dependency Decisions

| Package | Version | Decision |
|---|---:|---|
| `@vitest/coverage-v8` | `4.1.5` | Add to `src/web/devDependencies`; enforce web line coverage threshold. |
| `@axe-core/playwright` | `4.11.3` | Reuse; expand WCAG 2.1 AA route/core-flow sweeps. |
| `@inlang/paraglide-js` | `2.18.0` | Evaluate only behind `src/i18n/index.ts`; do not direct-import across app. |
| `@opentelemetry/api` | `1.9.1` | Optional facade only; no required SDK/exporter by default. |
| `@opentelemetry/sdk-node` | `0.216.0` | Avoid as default dependency. |
| `tweetnacl` | `1.0.3` | Keep/verify direct dependency for `src/secrets/vault.ts`. |
| `@sentry/*` | current | Do not adopt as core; Fulcrum has local sentry-equivalent requirement. |

## Validation Architecture

Phase 09 validation has eight dimensions:

1. **Parity matrix:** every XCT capability mapped to Web/CLI/TUI/API.
2. **i18n/theme:** locale/theme persist and render through Web/CLI/TUI/tRPC.
3. **Accessibility:** Web WCAG 2.1 AA route sweeps and TUI keyboard/high-contrast/non-color-only tests.
4. **Observability:** telemetry opt-in/off/purge and error log capture/reporting are local-first, PII-safe, and audited.
5. **Data safety:** backup/restore/import/export use preflight, dry-run, versioned manifests, redaction, counts, and verification.
6. **Secret/audit safety:** encryption-at-rest tested for all credential kinds; mutation events never include plaintext.
7. **Lifecycle safety:** migrations downgrade and graceful shutdown are executable gates.
8. **Coverage:** 80% line coverage enforced in local CI for root and web.

## Recommended Plan Waves

| Wave | Plans | Purpose |
|---|---|---|
| 0 | 09-00 | RED parity/coverage/audit matrix before implementation. |
| 1 | 09-01, 09-02, 09-03 | i18n/theme, accessibility, observability foundations. |
| 2 | 09-04, 09-05, 09-06 | backup/import/export, secrets/audit, migration/shutdown. |
| 3 | 09-07, 09-08 | coverage and broad test gates. |
| 4 | 09-09 | final UAT, CI, RED->GREEN evidence. |

## Sources

- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-PLATFORMS.md`
- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-DEPENDENCIES.md`
- `.planning/phases/09-cross-cutting-testing/09-RESEARCH-INTEGRATION.md`

## Validation Architecture

See `09-VALIDATION.md` for required commands and pass criteria.

## RESEARCH COMPLETE
