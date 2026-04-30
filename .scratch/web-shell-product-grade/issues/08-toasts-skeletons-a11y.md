# 08 — Toasts + skeletons + accessibility pass

Status: ready-for-agent
Risk tier: low
Severity: high
Dependencies: 03, 04, 05, 06, 07
File ownership:
- `src/web/src/lib/components/feedback/**`
- All routes already shipped (read-only sweep)

TDD plan:
- RED unit: `toast.test.ts` for the wrapper helper that takes a server-action result and dispatches `toast.success`/`toast.error`.
- RED component: `toaster.svelte.test.ts` mounts the toaster + dispatches `toast.success("ok")`, asserts the rendered DOM contains "ok".
- RED component: `skeleton.svelte.test.ts` per route asserts skeleton renders before `await load()` resolves (use `streamed` and a deferred promise).
- RED a11y: `a11y.audit.test.ts` runs `axe-core` against rendered routes; fail on any violation with severity ≥ "serious".
- GREEN: wire toaster into layout, add skeletons to every list/detail route, add `aria-label` on icon buttons.
- REFACTOR: extract `<RouteSkeleton kind="list|detail|board" />` to keep skeletons consistent.

Acceptance criteria:
- `sonner-svelte` mounted in `+layout.svelte`. Every form action returns `{ ok: true, message }` or `{ ok: false, message }`; client surfaces a toast.
- Skeleton loaders on every list and detail route while `await load()` is pending (use SvelteKit `streamed` for slow queries).
- All icon buttons have `aria-label`.
- Tab order audited route-by-route; focus ring visible.
- Keyboard nav for board (issue 05) verified end-to-end.
- Lighthouse accessibility audit ≥ 95 on `/`, `/projects`, `/docs`, `/boards`, `/runs`.
