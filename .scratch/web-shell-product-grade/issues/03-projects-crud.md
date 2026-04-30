# 03 — Projects CRUD

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/projects/**`
- `src/web/src/lib/server/projects.ts`
- `src/product-kernel/store/repositories.ts` (extend with `updateProject`, `deleteProject` if missing)

TDD plan:
- RED unit: `src/web/src/lib/server/projects.test.ts` exercises `createProjectAction(formData)`, `updateProjectAction(id, formData)`, `deleteProjectAction(id)` against a temp PGlite. Each test asserts the source row mutation AND the matching `events` row (`project.created` / `project.updated` / `project.deleted`).
- RED unit: `slugify.test.ts` for the auto-derived slug helper (collapse whitespace, lowercase, strip non `[a-z0-9-]`).
- RED component: `project-form.svelte.test.ts` renders the form, types into `name`, asserts `slug` field auto-fills, submits, asserts the SvelteKit `enhance` callback fires.
- RED component: `project-row.svelte.test.ts` clicks "set active" and asserts the cookie helper was called with the slug.
- GREEN: implement `+page.server.ts` actions, the `<ProjectForm />`, `<ProjectRow />`, `<DeleteProjectDialog />`, and the list table.
- REFACTOR: extract `<DangerZone />` reusable for docs/tasks deletes.

Acceptance criteria:
- `/projects` table view with shadcn `Table` (columns: name, slug, description, updated, actions). Filter by name. Empty state with CTA.
- `/projects/new` form (name, slug auto-derived, description). Server action calls `createProject` + writes a `project.created` event.
- `/projects/[id]` detail page with inline rename, description edit, danger-zone delete (uses `AlertDialog`). Update + delete go through SvelteKit form actions and write events.
- Set-active-project button on each row + on detail page (writes the cookie via fetch helper).
- Form validation via Zod (or similar) with inline error messages.
- Toasts on success/failure.
