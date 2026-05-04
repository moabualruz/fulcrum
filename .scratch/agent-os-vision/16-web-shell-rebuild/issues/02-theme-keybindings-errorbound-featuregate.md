---
Status: completed
ImplCommit: 5fbeeb77
ImplRuntime: codex
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 17-cross-cutting-platform/issues/04-theme-trpc-and-composable.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q38, Q-cross-cut, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Theming / customization")
Docs: https://kit.svelte.dev/docs, https://tailwindcss.com/docs
---

# Theme engine, keybindings dispatcher, error boundary, FeatureGate component

## What to build

Wire the `useTheme()` composable (from Pillar 17) into the SvelteKit root layout — inject CSS custom properties on SSR and update reactively on client. Server loads theme/keybinding state by resolving `ThemeService` and `KeybindingService` from `event.locals.container.get(...)`. Build the keybindings dispatcher reading `src/keybindings/schema.ts` + `default-web.ts` bindings + user overrides from `tenant_settings`. Build the `+error.svelte` error boundary. Build the `<FeatureGate flag="x">` wrapper component. Wire `window.onerror` to write to `local_telemetry` via `telemetry.recordError` tRPC call (Pillar 17 procedures).

Cuts through: `TenantSettingsRepository` read → `theme.get` tRPC → `useTheme()` composable → CSS vars on `:root` → Playwright assertion; keybindings schema → in-layout dispatcher → `⌘K` opens palette; `+error.svelte` catches tRPC FORBIDDEN; `<FeatureGate>` renders callout when flag OFF.

## Acceptance criteria

- [ ] Dark mode cookie persists across hard-reload; `data-mode` attribute set correctly; no FOUC (flash of unstyled content).
- [ ] CSS var overrides from `tenant_settings(key='web.theme.accent')` applied to `:root` on SSR first render.
- [ ] `mode-watcher` dark/light/auto switch: toggle in layout → cookie set → next SSR load honours it.
- [ ] Keybindings: `⌘K` / `Ctrl+K` opens palette (<50ms `performance.mark` assertion); `Esc` closes; no duplicate registration in same route context.
- [ ] User keybinding override written to `tenant_settings(user_id, key='web.keybindings.overrides')` round-trips.
- [ ] `+error.svelte`: tRPC `FORBIDDEN` error → renders "Permission denied" state with home link (no crash, no blank page).
- [ ] `<FeatureGate flag="non-existent">` renders "Enable this feature in Settings → Feature Flags" callout.
- [ ] `window.onerror` fires → `telemetry.recordError` called (spy assertion); no unhandled promise rejections from the handler itself.
- [ ] Vitest: `useTheme()` SSR-safe test (no `window` access during hydration).

## Blocked by

- Issue 01 (v0 teardown + scaffold) — layout must exist.
- Pillar 17 issue 04 (theme tRPC + composable) — `useTheme()` must be importable.
