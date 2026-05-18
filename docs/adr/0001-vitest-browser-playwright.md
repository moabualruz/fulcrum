# ADR-0001: Vitest Browser Playwright Provider

- **Status:** accepted
- **Date:** 2026-05-18

## Context

Wave 0a requires web and ui-kit component tests to run through Vitest browser mode in real Chromium, while service tests continue to use Node threads with per-file isolation and PGlite fixtures.

Vitest v4 browser mode requires a browser provider plus an instance. The official Vitest browser provider docs use `@vitest/browser-playwright` with `playwright()` and a Chromium instance.

## Decision

Add `@vitest/browser-playwright` and use it from `apps/web/vitest.browser.config.ts` and `packages/ui-kit/vitest.config.ts`.

Keep the shared Node-thread policy in root `vitest.config.ts`; package configs merge that common policy. Web keeps the existing happy-dom suite in `apps/web/vitest.config.ts`, while `apps/web/vitest.browser.config.ts` owns real-Chromium browser tests via `web:test:browser`.

## Consequences

- Web and ui-kit component tests can use real browser APIs instead of DOM emulation.
- Server tests keep isolated Node workers for PGlite setup.
- Playwright browser installation remains the responsibility of local test setup and CI images.

## References

- https://v4.vitest.dev/config/browser/enabled
- https://main.vitest.dev/config/browser/playwright
