# 04 — State store compatibility

Status: done
Risk tier: low
Dependencies: —
File ownership:
- `src/product-kernel/state/store.ts`
- `src/product-kernel/state.test.ts`
- `package.json` (add `zustand`)

Acceptance criteria:
- `createFulcrumStore` returns a Zustand vanilla store with `activeProjectId: string | null` and `setActiveProject(id)`.
- RED test fails before implementation; GREEN test (`bun test src/product-kernel/state.test.ts`) passes after.
- Subscribers receive the new state synchronously after `setActiveProject` is called.

Failure gate: if Zustand vanilla cannot be wrapped cleanly for SSR (relevant in Task 11), keep the same `createFulcrumStore` API and switch to TanStack Store under it.

## Comments
- Shipped in `bcdc6fc feat(product-kernel): add database, markdown, and state foundations`.
