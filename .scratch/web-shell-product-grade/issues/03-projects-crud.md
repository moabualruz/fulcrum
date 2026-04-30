# 03 — Projects CRUD

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/projects/**`
- `src/web/src/lib/server/projects.ts`
- `src/product-kernel/store/repositories.ts` (extend with `updateProject`, `deleteProject` if missing)

Acceptance criteria:
- `/projects` table view with shadcn `Table` (columns: name, slug, description, updated, actions). Filter by name. Empty state with CTA.
- `/projects/new` form (name, slug auto-derived, description). Server action calls `createProject` + writes a `project.created` event.
- `/projects/[id]` detail page with inline rename, description edit, danger-zone delete (uses `AlertDialog`). Update + delete go through SvelteKit form actions and write events.
- Set-active-project button on each row + on detail page (writes the cookie via fetch helper).
- Form validation via Zod (or similar) with inline error messages.
- Toasts on success/failure.
