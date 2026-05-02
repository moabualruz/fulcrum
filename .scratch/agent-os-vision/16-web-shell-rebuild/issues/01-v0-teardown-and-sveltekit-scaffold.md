---
Status: in-progress
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [01-foundation-reset/issues/06-trpc-core-router-and-permission-middleware.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q38, C4, Q28, Q21]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "editor experience bad", "no task view or management")
Docs: https://kit.svelte.dev/docs, https://ui.shadcn.com/docs/svelte
---

# v0 admin teardown + SvelteKit 2 shell scaffold

## What to build

Delete `src/web/src/routes/` v0 admin routes entirely. Scaffold the new SvelteKit 2 (Svelte 5 runes) app structure under `src/web/src/`. Establishes the `+layout.svelte` app shell with sidebar nav, topbar, theme-var injection, toast provider, and cmd+K portal mount. Wires `+layout.server.ts` for session hydration and feature-flag hydration by resolving services from `event.locals.container.get(...)`. Integrates Better-Auth `hooks.server.ts` with auto-redirect unauthenticated requests to `/auth/login` and attaches the shared needle-di container at `event.locals.container`. Mounts the tRPC client at `src/web/src/lib/trpc.ts`; server tRPC context sets `ctx.container = event.locals.container`. Updates `bun run ci` to point at the new build path. Adds a `docs/web-v0-migration.md` mapping old routes to new.

Cuts through: file system (delete v0) → SvelteKit layout hierarchy → `hooks.server.ts` session + container context → tRPC client/server wiring → `bun run ci` gate → Playwright smoke.

## Acceptance criteria

- [ ] All files under old `src/web/src/routes/` removed; `docs/web-v0-migration.md` present with route mapping table.
- [ ] `+layout.svelte`: sidebar nav, topbar, `<CommandPalette>` portal slot, `<Toaster>` (svelte-sonner), theme CSS vars applied to `:root` from tRPC `theme.get`.
- [ ] `+layout.server.ts`: loads `event.locals.session` + `event.locals.featureFlags` via `event.locals.container.get(...)`; unauthenticated → redirect `/auth/login` (except `/auth/*` and `/api/*`).
- [ ] `hooks.server.ts`: Better-Auth session validated per request; `event.locals.user` populated on valid session; `event.locals.container` present on every request.
- [ ] `src/web/src/lib/trpc.ts`: `createTRPCClient` with SvelteKit HTTP link; typed router from Pillar 1 `AppRouter`; stub smoke test calls `health.ping` and returns typed response.
- [ ] `bun run ci` web gates (`svelte-check`, `bun run build`, Vitest, Playwright headless) all pass on clean repo.
- [ ] Local-mode bypass: when `admin@local` auto-session present, layout renders without login redirect.
- [ ] Playwright: load `/` → shell renders (sidebar visible, topbar visible, no 500 errors).

## Blocked by

- Pillar 1 issue 06 (tRPC core router + permission middleware) — need `AppRouter` type + `/api/trpc` mount.
