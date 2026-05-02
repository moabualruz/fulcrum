---
Status: in-progress
Owner: codex-orchestrator
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/01-schema-migration-credentials-telemetry-errors-experiments.md, 01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B3, C4]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B3 theming)
Docs: https://kit.svelte.dev/docs
---

# Theme engine — generator.ts, useTheme() composable, theme.* tRPC, CLI + TUI integration

## What to build

`src/theme/generator.ts`: reads all theme values with `tenantSettingsRepo.find({ org, key: { $like: 'theme.%' } })` plus user-scoped overrides; emits a CSS custom-property block (`--fulcrum-accent`, `--fulcrum-radius`, `--fulcrum-font-family`, `--fulcrum-spacing-unit`, `--fulcrum-animation-duration`, `--fulcrum-dark-mode`); user overrides win over org-wide values; defaults applied for missing keys; accent HEX validation; dark/light/auto → `prefers-color-scheme` media block. `src/theme/composable.ts`: `useTheme()` Svelte composable — TS-side only, SSR-safe (no `window` access during hydration); reactive on `TenantSetting` changes via `theme.onSettingsChange` tRPC subscription. `theme.get`, `theme.update(key, value)`, `theme.reset` tRPC procedures with `assertPermission()`. CLI: `fulcrum theme list/get/set/reset [--json]`. TUI: reads theme at startup; applies accent to focused borders.

Cuts through: `theme.update('theme.accent', '#6D28D9')` → `TenantSettingRepository.upsertValue(...)` → `generator.ts` rebuilds CSS block → `useTheme()` reactive update → `:root` vars updated in browser.

## Acceptance criteria

- [ ] `generator.ts`: all 8 CSS vars generated with correct defaults; missing setting uses default; HEX validation rejects non-HEX; dark/light/auto produces correct media block.
- [ ] `useTheme()` SSR-safe: no `window` access during server render; Vitest SSR test passes.
- [ ] `theme.update` persists through `TenantSettingRepository`; `theme.get` returns same map; `theme.reset` restores all defaults.
- [ ] CLI `fulcrum theme set accent '#6D28D9'` → repository value updated; `fulcrum theme get accent --json` → `{key:'theme.accent', value:'#6D28D9'}`.
- [ ] TUI: accent color applied to focused border (ANSI approximation); Vitest unit test verifies color mapping.
- [ ] `assertPermission()`: only org-admin can set org-wide theme; any user can set user-level theme.

## Blocked by

- Issue 01 (schema) — `TenantSetting` entity (from Pillar 1 base) must exist with composite key and JSON value property.
- Pillar 1 issue 03 (composite indexes + flag stubs) — `TenantSetting` defaults seeded.
