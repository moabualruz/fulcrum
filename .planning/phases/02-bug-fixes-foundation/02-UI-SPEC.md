---
phase: 2
slug: bug-fixes-foundation
status: approved
shadcn_initialized: true
preset: shadcn-svelte-existing
created: 2026-05-04
---

# Phase 2 — UI Design Contract

> Visual and interaction contract for frontend-affecting Phase 2 work. Generated inline by `gsd-ui-phase`, verified against Phase 2 context and research.

---

## Scope

Phase 2 is not a broad visual redesign. UI work is limited to:

- **BUG-18:** Cmd+K / Ctrl+K opens the existing web command palette from the global layout.
- **FND-05:** Auth/init parity across Web, CLI, and TUI, including the existing TUI auth screen.
- **CI smoke e2e:** a stable browser smoke path may assert palette open/close behavior.

Everything else in Phase 2 is infrastructure/bug-fix work and should preserve current UI style.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn-svelte |
| Preset | existing app preset |
| Component library | shadcn-svelte / Bits UI where already used |
| Icon library | lucide-svelte / existing app icons |
| Font | Inter via existing web app font setup |

Rules:

- Do not introduce new component libraries for Phase 2.
- Do not add landing-page, marketing, decorative, or hero UI.
- Do not restyle shared shell/navigation while fixing Cmd+K.
- TUI auth work should use existing renderer primitives from `src/tui/renderer.ts` and existing `AuthScreen` shape.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, compact inline affordances |
| sm | 8px | Command palette item gaps, TUI row spacing |
| md | 16px | Default form/control spacing |
| lg | 24px | Settings/auth screen section breaks |
| xl | 32px | Dialog body/header separation |
| 2xl | 48px | Not expected in Phase 2 |
| 3xl | 64px | Not expected in Phase 2 |

Exceptions: none.

Cmd+K change should not shift page layout. Palette opens as overlay/dialog using existing component dimensions.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | existing app body token, typically 14-16px | 400 | existing token |
| Label | existing app label token, typically 12-14px | 500 | existing token |
| Heading | existing settings/dialog heading token, typically 18-24px | 600 | existing token |
| Display | not used | not used | not used |

Rules:

- Do not introduce viewport-scaled type.
- Do not use display/hero type for settings, palette, or auth surfaces.
- TUI text should remain dense and operational: section title, info rows, short action hints.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | existing app background token | Shell/page background |
| Secondary (30%) | existing app surface/popover token | Command palette overlay, settings panels |
| Accent (10%) | existing app primary/accent token | Active/focused palette item, selected TUI affordance |
| Destructive | existing destructive token | Destructive confirmations only; not expected in Phase 2 UI |

Accent reserved for:

- Focused command palette row
- Primary auth action affordance if already present
- TUI active/hint color already used by renderer

No new one-note palettes, gradients, or decorative color systems.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Command palette trigger | no visible instructional copy required |
| Command palette empty state heading | existing component copy; do not change unless test requires exact accessible text |
| Command palette error state | existing component copy; no new error surface expected |
| TUI auth heading | `Settings › Auth` |
| TUI auth fields | `User Email`, `User ID`, `Org`, `Role`, `Passkeys` |
| TUI passkey hint | `Press [e] to enroll a new passkey (opens browser)` |
| TUI exit hint | `Press [q] to go back` |

Rules:

- Do not add visible text explaining keyboard shortcuts solely to satisfy BUG-18.
- Prefer stable accessibility/test selectors over new instructional copy.
- Error messages for missing auth/session should be problem + next step, e.g. `No active CLI session found. Run fulcrum init or fulcrum auth login before protected auth commands.`

---

## Interaction Contract

### Web Cmd+K

- Global layout must listen for both `metaKey + k` and `ctrlKey + k`.
- Handler must call `preventDefault()` when opening/toggling palette.
- Shortcut must open the existing `CommandPalette` mounted in `src/web/src/routes/+layout.svelte`.
- Palette state should remain controlled by existing `paletteOpen` / `onOpenChange` pattern.
- Acceptance selector should use existing attributes:
  - `[data-command-palette][data-state='open']`
  - `[data-command-palette-input]`
  - `[data-command-palette-item]`
- Escape closes the palette using existing component behavior.
- Smoke e2e should cover open + visible input + Escape close. Full e2e/perf can remain in dedicated browser recipe.

### TUI Auth

- TUI auth screen remains within existing settings/auth flow.
- Screen must render current user/org/role/passkey values from resolved data, not hardcoded placeholders except when data is legitimately missing.
- Keys:
  - `q` or Escape exits.
  - `e` may emit current enrollment hint unless passkey enrollment URL is implemented in scope.
- Do not create a second auth screen or new renderer abstraction.

### Web Auth

- Web login/auto-session should preserve existing routes under `src/web/src/routes/auth/`.
- Phase 2 should verify current login/signup/invite surfaces rather than redesign them.
- If missing-session states are touched, keep copy short and operational.

---

## Accessibility Contract

- Cmd+K trigger must be keyboard-only reachable through global shortcut.
- Palette input must receive focus through existing component behavior.
- Palette must be dismissible by Escape.
- TUI auth screen must remain readable without color; labels and values must be text, not color-only.
- Browser smoke test should assert visibility via stable selectors, not pixel-only checks.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | existing command/dialog/popover primitives only if already present | no new registry install |
| third-party | none | block; not needed for Phase 2 |

No new shadcn blocks, npm UI kits, or icon packages are allowed for Phase 2 UI work.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-05-04

## UI-SPEC VERIFIED
