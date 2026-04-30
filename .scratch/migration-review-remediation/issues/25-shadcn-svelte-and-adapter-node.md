# 25 — shadcn-svelte and adapter-node parity (or ratify deviation)

Status: ready-for-human
Risk tier: low
Dependencies: 14
Source: `.scratch/claude-migration-review/REPORT.md` C5
File ownership:
- `src/web/package.json`
- `src/web/svelte.config.js`
- `src/web/src/lib/components/`

## Assumption

The web shell currently ships with Tailwind v4 + plain Svelte components rather than shadcn-svelte; adapter is `adapter-auto` rather than `adapter-node`. The current setup is functional and the user has not yet ratified or rejected the deviation. Park as `ready-for-human` until they pick.

Acceptance criteria (when run by a human):
- Decide: ratify the deviation (update PRD acceptance) OR re-add `@sveltejs/adapter-node` and shadcn-svelte components.
- Either path keeps `bun run check` and `bun run build` green.
