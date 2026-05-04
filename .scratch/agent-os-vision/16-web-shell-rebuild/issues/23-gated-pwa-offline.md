---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q38, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (PWA offline mode gated)
Docs: https://vite-pwa-org.netlify.app/guide/
---

# GATED: pwa-offline — service worker, app-shell cache, background sync, /offline fallback

## What to build

Behind `FULCRUM_FEATURES=pwa-offline`. `vite-plugin-pwa` in `vite.config.ts`; service worker caches app shell (`+layout.svelte`, CSS, JS chunks) + recent routes (last 5 visited). Background sync queue: mutations made offline queued in IndexedDB; replayed when connectivity restored. `/offline` SvelteKit route: fallback page rendered when server unreachable. Install prompt banner (Web App Install Prompt API) shown after 30s on desktop.

Flag OFF: no service worker registered; no `vite-plugin-pwa` in build; existing behavior unchanged. Flag ON: SW registered on load; `/offline` reachable; background sync queues failed tRPC mutations.

Failure gate: `vite-plugin-pwa` cache invalidation bugs → `workbox` manual setup replaces plugin.

## Acceptance criteria

- [ ] Flag OFF: no `navigator.serviceWorker` registration; `bun run build` does not include SW assets.
- [ ] Flag ON: SW registered on first load (`navigator.serviceWorker.ready` resolves); app shell served from cache on subsequent visit.
- [ ] `/offline` route: accessible when dev server shut down + SW cached; shows "You're offline, reconnecting..." message.
- [ ] Background sync: perform task status update while network blocked (Playwright network interception) → request queued in IndexedDB → re-enable network → mutation replayed → task status updated in DB.
- [ ] Install prompt: shown after 30s on desktop (mocked timing in test).
- [ ] `fulcrum doctor web`: `web.pwa_sw` check returns `ok` when SW registered; `skip` when flag OFF.

## Blocked by

- Issue 01 (scaffold) — SvelteKit app must exist.
