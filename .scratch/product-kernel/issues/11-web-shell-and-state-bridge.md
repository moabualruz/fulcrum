# 11 — Web shell and state bridge

Status: ready-for-human
Risk tier: high
Dependencies: product-kernel/02 (UI compatibility spike), product-kernel/04, product-kernel/06
File ownership:
- `src/web/`
- `src/web/src/lib/state/fulcrum-store.ts`
- `src/web/src/lib/state/fulcrum-store.test.ts`
- `src/web/src/lib/product-queries.ts`
- `src/web/src/lib/product-queries.test.ts`
- `src/web/src/routes/+layout.svelte`
- `src/web/src/routes/+page.svelte`
- `src/web/src/routes/projects/+page.svelte`
- `src/web/src/routes/docs/+page.svelte`
- `src/web/src/routes/boards/+page.svelte`
- `src/web/src/routes/runs/+page.svelte`

## Assumption

Blocked on issue 02 (UI compatibility spike) which is `ready-for-human`. Once the SvelteKit/shadcn-svelte scaffold lands and the human approves the framework choice, this issue becomes ready for implementation.

Acceptance criteria (when unblocked):
- Svelte-readable wrapper reflects `createFulcrumStore` updates.
- Project/docs/board/run query helpers read from product-kernel repositories rather than static data.
- First views: project list, docs list, read-only board view, read-only run monitor (backed by `agent_runs`).
- No React anywhere under `src/web/`.
- `bun run --bun tsc --noEmit` and `bun run ci` stay green.
