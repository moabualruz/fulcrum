# ui-kit design-token proposals

Tokens recommended for `packages/ui-kit/src/styles/tokens.css` after the current
form-primitive batch lands. None of these block existing PRDs; queue for a focused
token pass after the batch-1/2/3 components finish shipping.

## Why this exists

Each entry below was surfaced while authoring the Label/Checkbox/RadioGroup/Select
primitives. We hit the gap, reached for the nearest existing token, and noted the
mismatch here so the next pass can promote a real token instead of leaning on
ad-hoc Tailwind utilities. The OKLCH-only token policy (`DESIGN.md` §1.2) stays
intact: every proposed addition keeps the OKLCH form and lists the surface mapping
it should solve.

## Form input surface

| Proposal | Why | Suggested |
| --- | --- | --- |
| `--field-bg` (semantic) | Inputs/selects currently render against `--background`. A dedicated field surface lets us darken fields in elevated cards without changing canvas. | `oklch(0.985 0.002 270)` light / `oklch(0.22 0.01 270)` dark |
| `--field-bg-hover` | Avoids ad-hoc `hover:bg-muted` in primitives. | Mix of `--field-bg` × 4% accent |
| `--field-border-disabled` | Disabled `border-input` is currently 50% opacity. Should be its own muted token for a11y contrast. | `oklch(0.86 0.005 270)` |
| `--field-icon` | Trailing icons inside `<SelectTrigger>` use `opacity-60`. A semantic icon token lets icons stay legible in dark mode without per-component overrides. | `oklch(0.55 0.01 270)` |

## Selection state

| Proposal | Why | Suggested |
| --- | --- | --- |
| `--selected-bg` / `--selected-fg` | Checkbox + Radio + future Toggle each derive their selected paint from `--primary`. The semantic name should not assume the brand colour is reused; selection on a brand-themed surface needs distinct semantic. | derive from `--accent` until divergence is proven |
| `--indicator-dot` | RadioGroupItem indicator currently borrows `bg-primary`. A `--indicator-dot` semantic decouples the inner glyph from CTA buttons. | mirror `--selected-bg` initially |

## Focus + invalid states

| Proposal | Why | Suggested |
| --- | --- | --- |
| `--focus-ring-strong` | Current `focus-visible:ring-ring/40` opacity baked into components. A token lets us thicken focus ring per density mode (compact/cozy) without touching every primitive. | `oklch(0.62 0.18 250 / 0.55)` |
| `--invalid-ring` | `aria-invalid` rings reuse destructive at 30%. Lift to a token so the contrast can be tuned independently of destructive button paint. | `oklch(0.58 0.21 27 / 0.4)` |

## Listbox / dropdown surfaces

| Proposal | Why | Suggested |
| --- | --- | --- |
| `--listbox-bg` | SelectContent uses `--popover`; popover is overloaded for tooltips and dialogs. Dedicated listbox surface frees us to alter z-ordering shadows independently. | clone of `--surface-elevated` for now |
| `--listbox-row-hover` | Currently `bg-muted`. A dedicated semantic keeps the muted token free for `<dt>`/secondary text use. | `oklch(0.94 0.005 270)` |
| `--listbox-row-highlighted-fg` | Keyboard `data-[highlighted]` text reads from `text-foreground`; on long copy in PaletteCommand we need to distinguish active vs hover. | `--accent-foreground` |

## Density spacing

| Proposal | Why | Suggested |
| --- | --- | --- |
| `--field-height-sm` / `--field-height-md` / `--field-height-lg` | SelectTrigger encodes `h-8/h-9/h-10` as Tailwind classes. Hoist to tokens so density modes (cozy/compact/comfortable) flip a single var. | 28/36/40 px |
| `--field-padding-x` | Mirror of the above for horizontal padding. | 8/10/12 px |

## Process

1. Land each token as `--<name>: oklch(...)` in `packages/ui-kit/src/styles/tokens.css`.
2. Mirror into `apps/web/src/app.css` `@theme` so Tailwind v4 exposes the corresponding utility.
3. Replace the temporary Tailwind class usage in the consuming primitive within the same commit.
4. Add a `wave-0a-foundation` design E2E assertion for the new token under `tests/design-e2e/wave-0a-foundation.spec.ts`.
5. Capture the rationale in `DESIGN.md` §1 alongside the existing palette table.

Track outstanding proposals as PRDs once the form/display/feedback batches finish; do not
land tokens piecemeal without consuming primitives.
