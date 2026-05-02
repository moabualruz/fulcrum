---
Status: implemented
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/01-codegen-scaffold.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [C4, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Keyboard shortcuts registry as single source of truth. `src/keybindings/schema.ts` exports `KeybindingAction` Zod enum (covering navigation, task actions, doc actions, sprint actions, global palette/search/run actions, view toggles). `src/keybindings/defaults.ts` provides platform-aware defaults (macOS `⌘`, Linux/Win `Ctrl`). Per-user overrides are persisted through `TenantSettingsRepository` using key `keybinding.<action>`. Consumed by: web (`src/web/src/lib/keybindings.ts`), CLI (`fulcrum --help` banner), TUI (`src/tui/keybindings.ts`). Conflict detector: static check that no two actions share same binding per context; runs in CI.

- **Web**: hotkey handler via Svelte `use:keybind` action reads defaults + overrides.
- **CLI**: `fulcrum --help` and `fulcrum <domain> --help` show keyboard shortcut hints.
- **TUI**: OpenTUI keyboard event map reads from same schema.

## Acceptance criteria

- [x] `src/keybindings/schema.ts` exported `KeybindingAction` enum has all 40+ actions from PRD.
- [x] `src/keybindings/defaults.ts` provides bindings for all actions; platform-aware (`process.platform`).
- [x] `KeybindingAction` enum importable from `src/web`, `src/cli`, `src/tui` without error (CI type-check).
- [x] Conflict detector: test file with duplicate binding → `detectConflicts()` returns non-empty array; CI step asserts empty array on defaults.
- [x] `TenantSettingsRepository.set('keybinding.palette.open', 'Ctrl+P')` → web reads override; TUI reads override; `fulcrum --help` reflects override.
- [x] Zod parse of default bindings validates cleanly (no unknown action names).

## Blocked by

- 14/issues/01-codegen-scaffold.md

## Notes

P14.33–P14.34 maps to this slice. TUI reads this file from Pillar 15 (slice T15-03).
