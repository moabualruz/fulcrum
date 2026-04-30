# 02 — Sidebar layout + dark mode + active project picker

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: 01
File ownership:
- `src/web/src/routes/+layout.svelte`
- `src/web/src/routes/+layout.server.ts`
- `src/web/src/lib/components/app/**`
- `src/web/src/lib/state/active-project.ts`
- `src/web/src/hooks.server.ts`

TDD plan:
- RED: `active-project.test.ts` exercises the cookie helper (`getActiveProjectCookie`, `setActiveProjectCookie`) — null when unset, returns slug after set, clears on null.
- RED: `nav-items.test.ts` snapshots the sidebar item list (Dashboard / Projects / Docs / Board / Runs / Search) so reordering is intentional.
- RED: Svelte component test (`+layout.svelte.test.ts`) renders the layout with Testing Library, asserts the breadcrumb reflects `$page.url.pathname`, the project picker renders the resolved slug, and the theme toggle button is present with `aria-label="toggle theme"`.
- GREEN: implement `+layout.server.ts` to populate `event.locals.activeProjectId` from the cookie, the picker dropdown to set it via fetch action, and the responsive sheet for mobile.
- REFACTOR: extract shared `<AppSidebar />`, `<AppTopbar />`, `<ProjectPicker />` components.

Acceptance criteria:
- Persistent left sidebar (Dashboard / Projects / Docs / Board / Runs / Search) using shadcn `Sidebar` primitives.
- Top bar contains: breadcrumb derived from current route, project picker dropdown, theme toggle, cmd+K hint, avatar menu.
- Active project persisted in `fulcrum_active_project` cookie via `+layout.server.ts` and exposed through `event.locals.activeProjectId`.
- `mode-watcher` toggles between light/dark via shadcn `DropdownMenu` action.
- Mobile (<= 768px) collapses sidebar into a `Sheet`.
- No `console.log`/no debug text shipped.

## Sub-tasks

- [ ] **02.1 — Cookie-backed active-project module.** Owns: `src/web/src/lib/state/active-project.ts`, `src/web/src/lib/state/active-project.test.ts`. RED: tests for `getActiveProject(cookies)` returns null when unset, returns slug after `setActiveProject`, clears on null.
- [ ] **02.2 — `hooks.server.ts` + `+layout.server.ts` load.** Owns: `src/web/src/hooks.server.ts`, `src/web/src/routes/+layout.server.ts`. RED: integration test boots SvelteKit handle, asserts `event.locals.activeProjectId` populated from cookie.
- [ ] **02.3 — `AppSidebar` + `nav-items` config.** Owns: `src/web/src/lib/components/app/AppSidebar.svelte`, `src/web/src/lib/components/app/nav-items.ts`, `src/web/src/lib/components/app/AppSidebar.svelte.test.ts`. RED: snapshot of nav items in declared order; component test asserts each link rendered with correct `href`.
- [ ] **02.4 — `AppTopbar` (breadcrumb + theme toggle + cmd+K hint).** Owns: `src/web/src/lib/components/app/AppTopbar.svelte`, `.svelte.test.ts`. RED: breadcrumb reflects `$page.url.pathname`; theme toggle button has `aria-label="toggle theme"`; cmd+K hint visible with the `kbd` key combo.
- [ ] **02.5 — `ProjectPicker` dropdown + form action.** Owns: `src/web/src/lib/components/app/ProjectPicker.svelte`, `src/web/src/routes/api/active-project/+server.ts`. RED: clicking a project entry posts to `/api/active-project`; mock fetch asserts payload + cookie set.
- [ ] **02.6 — Mobile sheet collapse + assemble layout.** Owns: `src/web/src/routes/+layout.svelte`. RED: media-query helper test asserts the sheet trigger is rendered when `viewport < 768px` (use a tiny `MediaQueryStub`). GREEN: wire AppSidebar inside Sheet on mobile, sticky on desktop. Commit `feat(web): add app shell sidebar, topbar, theme toggle, project picker`.
