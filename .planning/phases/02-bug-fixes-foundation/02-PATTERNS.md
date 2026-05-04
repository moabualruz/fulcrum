# Phase 2 Pattern Map

## PATTERN MAPPING COMPLETE

Phase 2 should reuse these existing implementation shapes.

| Work Area | Target Files | Closest Existing Analogs | Pattern To Follow |
|-----------|--------------|--------------------------|-------------------|
| CI/web gates | `scripts/ci.ts`, `scripts/ci.test.ts`, `package.json`, `src/web/package.json` | Existing `STEPS` array in `scripts/ci.ts`; opt-in Playwright gate; web scripts | Add named `Step` entries and tests against `STEPS`; keep root command `bun run ci` canonical |
| Compiled DB runtime | `src/product-kernel/db/pglite.ts`, `src/product-kernel/db/postgres.ts`, `src/product-kernel/db/migrate.ts`, `src/cli/commands/db.ts`, `src/cli/product.ts` | `tests/db/migrator-service.test.ts`, `tests/db/mikro-orm-config.test.ts`, product-kernel migration tests | Resolve DB backend through env/config/CLI, default PGlite, explicit migrate command, no implicit compiled-mode migrations |
| Installer ownership | `src/cli/install.ts`, `src/cli/uninstall.ts`, `src/cli/vendor-installs.ts`, `src/cli/package-mirror.ts`, `src/cli/package-parity.ts`, `src/cli/component.ts` | `src/cli/install.test.ts`, `src/cli/uninstall.test.ts`, `src/cli/claude-plugin-markers.test.ts`, `src/cli/vendor-packages.test.ts` | Marker-gated removals, dry-run/confirm behavior, filesystem-native status checks, native-root parity validation |
| Targeted patchers | `src/cli/install.ts`, config/manifest writers, frontmatter helpers | Existing sentinel splice and marker-preserving install behavior | Patch only owned keys/blocks; preserve byte-stable unowned content; test no parse/stringify rewrites |
| Product CLI/runtime bugs | `src/cli/product.ts`, `src/cli/doctor.ts`, `src/web/src/routes/+layout.svelte`, command palette helpers | `src/cli/product.test.ts`, `src/cli/doctor.test.ts`, `src/web/src/lib/components/command-palette/command-palette-handlers.ts`, `src/web/tests/e2e/user-journey.spec.ts` | RED tests for parser/warning count/shortcut; route global keydown through existing handler |
| Tenant/settings/indexes/flags | `src/db/entities/**`, `src/db/repositories/**`, `src/db/migrations/**`, `src/flags/registry.ts`, `src/tui/feature-flags.ts` | `tests/db/migrations/*`, `tests/flags/registry.test.ts`, auth entity/repository patterns | MikroORM entity + repository + migration test; composite indexes verified in migration tests; TUI flags bridge canonical registry |
| Permissions | `src/trpc/middleware.ts`, `src/server/trpc/routers/**`, `src/trpc/routers/**`, `tests/trpc/app-router-scaffold.test.ts`, `tests/trpc/router.test.ts` | Existing `protectedProcedure` and `assertPermission`; scaffold lint test | Hard-fail every protected tRPC procedure without permission metadata/check; keep public auth allowlist explicit |
| Worker/auth parity | `src/workers/**`, `src/notifications/fanout-worker.ts`, `src/artifacts/worker.ts`, `src/cli/commands/auth.ts`, `src/tui/screens/auth.ts`, web auth routes | Worker task registration patterns in notification/artifact tests; auth router and CLI auth tests | Registry wraps task name + payload assertion + handler; Web/CLI/TUI auth read same session contract |

## Schema-Relevant Files

Plans 02-02 and 02-06 modify DB/migration/entity files. They must include explicit `fulcrum db migrate` verification before final CI.

