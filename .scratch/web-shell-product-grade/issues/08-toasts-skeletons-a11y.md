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

## Sub-tasks

- [x] **08.1 — `ActionResult` + `dispatchToast` helpers.** Owns: `src/web/src/lib/feedback/action-result.ts`, `.test.ts`. RED: `{ ok, message }` round-trips through `dispatchToast`.
  Comment: feat(web): add ActionResult + dispatchToast feedback helpers (187e3a7). 4 tests pass; bun run ci 9/9, check 0/0/0.
- [x] **08.2 — `Toaster` mount in `+layout.svelte`.** Owns: `src/web/src/routes/+layout.svelte` (extend). RED: smoke test imports the layout, asserts `<Toaster />` present.
  Comment: feat(web): wire form-action toasts via dispatchToast bridge. New `use-form-toast.ts` helper + test (5 cases); action servers (runs/[id], boards) return `actionOk`/`actionFail`; layout `$effect` bridges `page.form` to toaster. RED 8 fail → GREEN 13 pass; bun run check 0/0/0; bun run ci 9/9.
- [x] **08.3 — `RouteSkeleton` variants.** Owns: `src/web/src/lib/components/feedback/RouteSkeleton.svelte`, `.svelte.test.ts`. RED: `kind="list"` renders `<table>` skeleton; `kind="board"` renders 5-column skeleton; `kind="detail"` renders title + 3 paragraphs.
  Comment: feat(web): add RouteSkeleton (list/detail/board variants) (2eaa1cd). 5 tests pass; bun run check 0/0/0, bun run ci 9/9.
- [ ] **08.4 — Wire skeleton via SvelteKit `streamed`.** Owns: every list/detail route's `+page.server.ts`. RED: load test resolves with `streamed` and skeleton renders during pendency.
- [ ] **08.5 — `axe-core` a11y assertions.** Owns: `src/web/tests/a11y/*.test.ts`. RED: per route, render and assert no `serious` or `critical` violations.
- [ ] **08.6 — Aria + keyboard sweep.** Owns: existing icon buttons across routes. RED: snapshot test asserts every icon-only button has `aria-label`.
