# Phase 08 Research: Dependencies

**Researched:** 2026-05-06  
**Goal:** Minimize custom code while preserving local-first/Bun/SvelteKit architecture.

## Current Project Dependencies

Already installed and should be reused:

- `@hono/zod-openapi@1.3.0` in root `package.json` for OpenAPI route/schema generation.
- `hono@4.12.16`, `zod@4.4.2`, `@electric-sql/pglite@0.4.5`, `@mikro-orm/postgresql` stack.
- Web: `shadcn-svelte@^1.2.7`, `bits-ui@^2.16.3`, `@playwright/test@^1.59.1`, `layerchart@^1.0.13`, `@event-calendar/core@^5.7.0`, `wx-svelte-gantt@^2.6.1`, `svelte-dnd-action@^0.9.69`, `@tanstack/svelte-table@^8.21.3`, `@tanstack/svelte-virtual@^3.13.24`, TipTap `3.22.5`, Orama `^3.1.18`, `tinykeys@^3.0.0`, `yjs@^13.6.30`.
- Root: `asciichart@1.5.25` for TUI charts, `web-push@3.6.7`, `nodemailer@8.0.7`, `ws@8.18.3`.

## Candidate Dependencies

| Package | Current npm version checked | Use | Decision |
|---|---:|---|---|
| `@opentui/core` | `0.2.2` | Native terminal renderer, keyboard/mouse protocols, render loop. | Add in Phase 08 TUI adapter gate. Required by TUI-01. |
| `@opentui/solid` | `0.2.2` | JSX reconciler without introducing React into a Svelte project. | Preferred JSX binding for TUI if spike passes. |
| `@opentui/react` | `0.2.2` | React JSX reconciler. | Avoid unless Solid binding fails; adding React only for TUI is unnecessary dependency spread. |
| `hono-rate-limiter` | `0.5.3` | Hono rate limiting middleware. | Do not adopt blindly; inspect before use. If local in-memory + PGlite-backed limits are small, custom middleware may be safer. |
| `hono-rate-limit` | `1.0.2` | Basic Hono rate limiting. | Avoid: older, narrower API, local/Redis focus not aligned with PGlite/Postgres local-first. |
| `clipanion` | `4.0.0-rc.4` | Typed CLI parser framework. | Do not migrate CLI in Phase 08. Existing parser and command files are already broad; migration would be scope risk. |
| `oclif` | current framework, heavy CLI generator/runtime. | Full CLI framework, plugins, installers. | Do not adopt. Fulcrum has Bun compiled binary and existing command architecture. |
| `cac` | `6.7.14` | Lightweight CLI parser. | Do not adopt unless parser becomes blocker; existing `src/cli/arg-parser.ts` is already project-specific. |

## Dependency Decisions

- **D-DEP-01:** Add `@opentui/core@0.2.2` and `@opentui/solid@0.2.2` only inside a TUI renderer-adapter plan. First test must prove install/build/launch on macOS; Linux binary build must be verified by existing build target or Docker/native Linux gate.
- **D-DEP-02:** Keep current CLI parser and generated command registry. Do not introduce `oclif`, `commander`, `cac`, or `clipanion` in Phase 08.
- **D-DEP-03:** Keep `@hono/zod-openapi@1.3.0` as REST/OpenAPI source. Add missing route schemas/tests rather than swapping OpenAPI library.
- **D-DEP-04:** Implement rate limiting as a small Fulcrum middleware keyed by org/user/API key and backed by local memory first, with repository-backed persistent counters only if tests require process restart semantics. Consider `hono-rate-limiter@0.5.3` only after source inspection proves Bun + Hono + local store fit.
- **D-DEP-05:** No new Web component libraries. Use existing shadcn-svelte/Bits UI components and existing Phase 5-7 libraries.

## Source Notes

- `@opentui/core`, `@opentui/solid`, `@opentui/react` versions checked with npm registry on 2026-05-06.
- OpenTUI docs state `createCliRenderer` loads a native Zig rendering library and configures terminal keyboard/mouse protocol.
- OpenTUI upstream README still describes project as in development. This requires a gate, not blind replacement.
- `@hono/zod-openapi` docs define it as an OpenAPIHono extension for Zod validation and OpenAPI generation.
- GitHub CLI/oclif/Clipanion research supports keeping current command structure and adding parity/completion instead of framework migration.

## Sources

- OpenTUI docs: https://opentui.com/docs/core-concepts/renderer/
- OpenTUI GitHub: https://github.com/anomalyco/opentui
- `@hono/zod-openapi`: https://www.npmjs.com/package/%40hono/zod-openapi
- `hono-rate-limiter`: https://www.npmjs.com/package/hono-rate-limiter
- Clipanion docs: https://mael.dev/clipanion/docs/
- oclif docs: https://oclif.io/docs/configuring_your_cli/
- `cac` package docs: https://www.npmjs.com/package/cac
