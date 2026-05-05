# Phase 08: Surface Delivery - Patterns

**Mapped:** 2026-05-06

## Pattern Map

| Work Area | New/Modified Files | Closest Existing Analogs | Pattern To Copy |
|---|---|---|---|
| Parity matrix | `src/surfaces/parity.ts`, `src/surfaces/parity.test.ts` | `src/trpc/__tests__/root-wiring.test.ts`, `src/cli/generated-domains.ts` | Static inventory tests with explicit expected domain lists. |
| CLI dispatch | `src/cli/index.ts`, `src/cli/commands/*` | `src/cli/commands/repos.ts`, `src/cli/commands/docs.ts`, `src/cli/commands/pillar14-generated.ts` | Lazy import command modules; build DB container only for non-help command paths; use local caller. |
| CLI JSON | domain command tests | `src/cli/product.test.ts`, `src/cli/commands/report.test.ts`, `src/cli/notify.test.ts` | Capture stdout, `JSON.parse`, assert typed fields. |
| Completion | `src/cli/completion.ts`, `src/cli/index.ts` | existing `src/cli/completion.ts`; GitHub CLI pattern | `fulcrum completion --shell bash|zsh|fish|powershell`. |
| API routes | `src/api/hono.ts`, `src/api/routes/*.ts` | `src/api/routes/kernel-tasks.ts`, `src/api/routes/kernel-notifications.ts`, `src/api/__tests__/repos.api.test.ts` | `createRoute` + `api.openapi` + Zod schemas; DB injected via Hono context. |
| tRPC schema validation | `src/trpc/__tests__/schema-validation.test.ts` | `src/trpc/__tests__/root-wiring.test.ts`, `src/trpc/routers/*.test.ts` | Router-group smoke tests and focused bad-payload tests. |
| TUI renderer | `src/tui/opentui/*`, `src/tui/index.ts` | `src/tui/renderer.ts`, `src/tui/testing/fake-tty.ts`, OpenTUI `createCliRenderer` docs | Adapter boundary so screens remain testable. |
| TUI screens | `src/tui/screens/*` | `src/tui/screens/repos.ts`, `src/tui/screens/notifications.ts`, `src/tui/screens/search-screen.ts` | Typed caller methods and plain-text assertions in tests. |
| Web route UAT | `src/web/tests/e2e/phase08-surface-delivery.spec.ts` | `src/web/tests/e2e/phase05-*`, `phase06-*`, `phase07-*` | Reuse fixtures and conditional skip pattern for service-dependent routes. |
| Final gates | `src/cli/__tests__/phase08-parity-smoke.test.ts`, web e2e, API smoke | `src/cli/__tests__/phase07-parity-smoke.test.ts` | One cross-surface smoke suite verifies representative domains. |

## Must Preserve

- `src/cli/index.ts` lazy import + cleanup pattern.
- `src/tui/testing/fake-tty.ts` headless testing.
- `src/api/hono.ts` as single public API factory.
- `src/trpc/router.ts` as canonical procedure inventory.
- Web route structure under `src/web/src/routes/`; no redesign.

## PATTERN MAPPING COMPLETE
