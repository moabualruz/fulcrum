---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/01-tui-foundation-launcher.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [Q-cross-cut, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Theming / customization" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Theme engine `src/tui/theme.ts` that reads `tenant_settings` CSS-var values (`--color-primary`, `--color-bg`, `--color-surface`, `--color-muted`, `--color-success`, `--color-destructive`) and maps to `picocolors` ANSI codes. Palette slots: fg-primary, fg-muted, bg-panel, bg-focused, border, success, warning, error. Five built-in presets: dark, light, monokai, solarized-dark, dracula. Settings → Theme screen cycles presets via `n` key; selection writes to `tenant_settings`. Failure gate: if picocolors breaks on Windows ConPTY, switch to `chalk` (MIT, same API, `chalk.level=3`).

- **Web**: web theming uses CSS vars directly (Pillar 16/Pillar 1 foundation); TUI maps same vars to ANSI.
- **CLI**: CLI output uses `picocolors` for doctor spinner icons; same library, no per-user theme.
- **TUI**: all widgets use theme palette tokens.

## Acceptance criteria

- [ ] Dark preset: `theme.colors.bg_panel` = correct ANSI escape for dark background; FakeTTY snapshot.
- [ ] CJK chars not broken by colour codes: `truncate('中文', 4)` with ANSI wrapping → correct visual width.
- [ ] `n` key cycles preset: dark → light → monokai → solarized-dark → dracula → dark; `tenant_settings` row updated each cycle.
- [ ] `tenant_settings` override: set `--color-primary` to custom hex → mapped to nearest ANSI 256 colour.
- [ ] All 5 presets render correct ANSI colours (snapshot test per preset, strip-ansi before compare not applied here — ANSI codes are the output under test).
- [ ] Doctor check `tui.theme_preset`: valid preset name in `tenant_settings` → pass; unknown name → warn + fall back to dark.

## Blocked by

- 15/issues/01-tui-foundation-launcher.md

## Notes

T15-05 maps to this slice. Palette settings screen is part of slice 22 (Settings navigator).
