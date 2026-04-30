# 08 — Toasts + skeletons + accessibility pass

Status: ready-for-agent
Risk tier: low
Severity: high
Dependencies: 03, 04, 05, 06, 07
File ownership:
- `src/web/src/lib/components/feedback/**`
- All routes already shipped (read-only sweep)

Acceptance criteria:
- `sonner-svelte` mounted in `+layout.svelte`. Every form action returns `{ ok: true, message }` or `{ ok: false, message }`; client surfaces a toast.
- Skeleton loaders on every list and detail route while `await load()` is pending (use SvelteKit `streamed` for slow queries).
- All icon buttons have `aria-label`.
- Tab order audited route-by-route; focus ring visible.
- Keyboard nav for board (issue 05) verified end-to-end.
- Lighthouse accessibility audit ≥ 95 on `/`, `/projects`, `/docs`, `/boards`, `/runs`.
