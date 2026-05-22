# UI Kit Context

## Language

- UI primitive: a reusable Svelte component that owns one interaction or visual role across Fulcrum surfaces.
- Token: an OKLCH design value exported through `src/styles/tokens.css`.
- Slot hook: a stable `data-slot` attribute used by design tests and downstream composition.
- State attribute: a `data-*` value such as `data-state`, `data-variant`, `data-size`, or `data-status` that exposes controllable UI state.
- Variant: a typed component option implemented by component props or `tailwind-variants`.

## Relationships

- `packages/ui-kit/src/index.ts` is the public package barrel for `@fulcrum/ui-kit`.
- `packages/ui-kit/src/components/**` owns shared UI primitives consumed by `apps/web` and future desktop surfaces.
- `packages/ui-kit/src/styles/tokens.css` owns shared design tokens; component CSS must use tokens rather than raw color literals.
- Shared workflow and run vocabulary comes from `@fulcrum/shared-dto` when it is cross-surface contract data.
- Feature routes may compose primitives but must not re-implement buttons, inputs, dialogs, menus, status badges, or other ui-kit responsibilities locally.

## Example dialogue

- "Need a repeated project status chip in web and desktop." "Add or extend a ui-kit primitive, export it from `src/index.ts`, then consume it."
- "Need a route-only layout wrapper." "Keep it in the route unless it becomes a reusable UI primitive."
- "Need a destructive button variant." "Extend `Button` with a typed variant and token-backed styles; do not fork a second button."

## Flagged ambiguities

- Some root, portal, and provider wrappers intentionally have less rendered DOM than content components. Preserve `data-slot` on rendered content and add wrapper hooks only when tests or composition need them.
