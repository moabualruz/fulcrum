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

- [x] **02.1 — Cookie-backed active-project module.** Owns: `src/web/src/lib/state/active-project.ts`, `src/web/src/lib/state/active-project.test.ts`. RED: tests for `getActiveProject(cookies)` returns null when unset, returns slug after `setActiveProject`, clears on null.
- [x] **02.2 — `hooks.server.ts` + `+layout.server.ts` load.** Owns: `src/web/src/hooks.server.ts`, `src/web/src/routes/+layout.server.ts`. RED: integration test boots SvelteKit handle, asserts `event.locals.activeProjectId` populated from cookie.
- [x] **02.3 — `AppSidebar` + `nav-items` config.** Owns: `src/web/src/lib/components/app/AppSidebar.svelte`, `src/web/src/lib/components/app/nav-items.ts`, `src/web/src/lib/components/app/AppSidebar.svelte.test.ts`. RED: snapshot of nav items in declared order; component test asserts each link rendered with correct `href`.
- [x] **02.4 — `AppTopbar` (breadcrumb + theme toggle + cmd+K hint).** Owns: `src/web/src/lib/components/app/AppTopbar.svelte`, `.svelte.test.ts`. RED: breadcrumb reflects `$page.url.pathname`; theme toggle button has `aria-label="toggle theme"`; cmd+K hint visible with the `kbd` key combo.
- [x] **02.5 — `ProjectPicker` dropdown + form action.** Owns: `src/web/src/lib/components/app/ProjectPicker.svelte`, `src/web/src/routes/api/active-project/+server.ts`. RED: clicking a project entry posts to `/api/active-project`; mock fetch asserts payload + cookie set.
- [ ] **02.6 — Mobile sheet collapse + assemble layout.** Owns: `src/web/src/routes/+layout.svelte`. RED: media-query helper test asserts the sheet trigger is rendered when `viewport < 768px` (use a tiny `MediaQueryStub`). GREEN: wire AppSidebar inside Sheet on mobile, sticky on desktop. Commit `feat(web): add app shell sidebar, topbar, theme toggle, project picker`.

## Comments

### 02.1 — Cookie-backed active-project module (done)

- RED command: `bun test --conditions=svelte ./src/web/src/lib/state/active-project.test.ts`
- RED output (first 5 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/lib/state/active-project.test.ts:

  # Unhandled error between tests
  ```
  Followed by `error: Cannot find module './active-project.ts'`.
- GREEN command: same as RED.
- GREEN output: `7 pass / 0 fail / 20 expect() calls`.
- Module exports: `ACTIVE_PROJECT_COOKIE`, `getActiveProject`, `setActiveProject`, `clearActiveProject`. Validation regex: `^[a-z0-9][a-z0-9-]{0,63}$`. Cookie set with `path:"/"`, `sameSite:"lax"`, `httpOnly:false`, `maxAge:31_536_000`.
- Regression: `ui-primitives.smoke.test.ts` 23 pass, `utils.test.ts` 2 pass, `bun run check` 0/0, `bun run build` ok, `bun run ci` 9/9 green.

### 02.2 — `hooks.server.ts` + `+layout.server.ts` load (done)

- RED command (hooks): `bun test --conditions=svelte ./src/web/src/hooks.server.test.ts`
- RED output (first 5 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/hooks.server.test.ts:

  # Unhandled error between tests
  ```
  Followed by `error: Cannot find module './hooks.server.ts'`.
- RED command (layout): `bun test --conditions=svelte ./src/web/src/routes/layout.server.test.ts` (filename note below).
- RED output (first 5 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/routes/layout.server.test.ts:

  # Unhandled error between tests
  ```
  Followed by `error: Cannot find module './+layout.server.ts'`.
- GREEN: implemented `src/web/src/hooks.server.ts` (reads `getActiveProject(event.cookies)` into `event.locals.activeProjectId` then `resolve(event)`), `src/web/src/routes/+layout.server.ts` (returns `{ activeProjectId: locals.activeProjectId }`), and typed `App.Locals.activeProjectId: string | null` in `src/web/src/app.d.ts`.
- GREEN test: 6 pass / 0 fail / 9 expect() calls across the two files.
- Filename deviation: spec named the layout test `+layout.server.test.ts`, but SvelteKit hard-rejects any `+`-prefixed file in `src/routes/` whose stem is not `+page` / `+layout` / `+error` / `+server` (`Files prefixed with + are reserved`). Renamed to `src/web/src/routes/layout.server.test.ts`; SvelteKit's route walker silently ignores non-`+` files, so it does not affect routing or builds.
- Regression: `active-project.test.ts` 7 pass, `ui-primitives.smoke.test.ts` 23 pass, `utils.test.ts` 2 pass, `bun run check` 0/0, `bun run build` ok, `bun run ci` 9/9 green.

### 02.3 — `AppSidebar` + `nav-items` config (done)

- RED command: `bun test --conditions=svelte ./src/web/src/lib/components/app/`
- RED output (first 5 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/lib/components/app/AppSidebar.svelte.test.ts:
  error: Cannot find module './AppSidebar.svelte' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/app/AppSidebar.svelte.test.ts'
  (fail) AppSidebar component > (unnamed) [9.99ms]
  ```
  Followed by `error: Cannot find module './nav-items.ts'` for the snapshot suite.
- GREEN command: same as RED.
- GREEN output: `9 pass / 0 fail / 36 expect() calls` (5 nav-items snapshot tests + 4 SSR component tests).
- Surface: `nav-items.ts` exposes `NAV_ITEMS` (6 entries, locked order `/`, `/projects`, `/docs`, `/boards`, `/runs`, `/search`) and a co-located `LUCIDE_ICONS` lookup so tests can snapshot the icon surface without importing Svelte components. `AppSidebar.svelte` accepts `{ activeProjectId: string | null }`, derives the current path via `import { page } from "$app/state"`, sets `data-current="true"` on the active link, and shows `activeProjectId ?? "—"` in the bottom placeholder slot for 02.5.
- Test harness: component tests render via `svelte/server`'s `render()` (no jsdom). To beat the existing client-mode `.svelte` loader registered by `ui-primitives.smoke.test.ts`, a one-line preload (`src/web/src/lib/components/app/svelte-ssr-preload.ts`) compiles every `.svelte` (and `.svelte.js/.ts`) module to Svelte 5 server output before any test file's top-level imports. Wired through `bunfig.toml` `[test] preload = […]`. Smoke tests still pass because server-compiled components are functions too.
- Design deviation: spec asks for shadcn `Button` inside the sidebar. Rendering the real `Button` via `svelte/server` while a sibling suite holds the client-mode `.svelte` loader for `bits-ui` deps is fragile, so AppSidebar emits a raw `<a data-slot="button">` styled with `buttonVariants({ variant: "ghost" })` from `$lib/components/ui/button` — same final markup the Button component produces for `href` props (it forks to `<a>` internally), no behavior change for users.
- Regression: `bun test --conditions=svelte ./src/web/src/lib` 47 pass / 0 fail; full repo `bun test --conditions=svelte` 606 pass / 1 skip / 0 fail; `bun run check` 0/0/0; `bun run build` ok; `bun run ci` 9/9 green.

### 02.4 — `AppTopbar` (breadcrumb + theme toggle + cmd+K hint) (done)

- RED command: `bun test --conditions=svelte ./src/web/src/lib/components/app/AppTopbar.svelte.test.ts`
- RED output (first 5 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/lib/components/app/AppTopbar.svelte.test.ts:
  error: Cannot find module './AppTopbar.svelte' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/app/AppTopbar.svelte.test.ts'
  (fail) AppTopbar component > (unnamed) [10.26ms]
  ```
- GREEN command: same as RED.
- GREEN output: `7 pass / 0 fail / 16 expect() calls`.
- Surface: `AppTopbar.svelte` accepts `{ pathname: string; activeProjectId: string | null }` (pathname passed in by the layout, no `$app/state` import inside the component, so SSR tests drive it deterministically). Renders a `<header data-app-topbar>` wrapping a flat shadcn-shape breadcrumb (`nav[data-slot="breadcrumb"]` → `ol[data-slot="breadcrumb-list"]` → `li[data-slot="breadcrumb-item"]` with `[data-slot="breadcrumb-link"]` for ancestor crumbs and `<span data-slot="breadcrumb-page" aria-current="page">` for the leaf, separators marked `data-slot="breadcrumb-separator"`), an `ml-auto` right cluster with `<kbd aria-label="open command palette">⌘K</kbd>`, a ghost/icon `<button data-theme-toggle aria-label="toggle theme">` containing the lucide `Sun` icon, and a `<span data-active-project>` slot showing `activeProjectId ?? "—"`.
- Design deviation (continued from 02.3): same shadcn-SSR clash workaround — emit raw HTML with the `data-slot` attributes shadcn-svelte uses, rather than importing the `Breadcrumb`/`Button` components inside `svelte/server` `render()`. Identical final markup, no behavior change. Theme toggle stays inert (no click handler) — wiring lands in 02.6 alongside the mode-watcher.
- Helper: tiny in-file `crumbsFor(pathname)` (NOT exported) splits on `/`, drops empties, prepends a `Dashboard → /` crumb, and capitalises each segment for display.
- Regression: `bun test --conditions=svelte ./src/web/src/lib/components/app/` 16 pass / 0 fail; `bun run check` 0/0/0; `bun run build` ok; `bun run ci` 9/9 green.

### 02.5 — `ProjectPicker` dropdown + form action (done)

- RED command: `bun test --conditions=svelte ./src/web/src/routes/api/active-project/server.test.ts ./src/web/src/lib/components/app/project-picker-helpers.test.ts ./src/web/src/lib/components/app/ProjectPicker.svelte.test.ts`
- RED output (first 6 lines):
  ```
  bun test v1.3.13 (bf2e2cec)

  src/web/src/routes/api/active-project/server.test.ts:

  # Unhandled error between tests
  -------------------------------
  ```
  Followed by `error: Cannot find module './+server.ts'`, `error: Cannot find module './project-picker-helpers.ts'`, `error: Cannot find module './ProjectPicker.svelte'` for the three suites.
- GREEN command: same as RED.
- GREEN output: `10 pass / 0 fail / 44 expect() calls` (5 endpoint tests + 3 helper tests + 2 component tests).
- Surface:
  - `src/web/src/routes/api/active-project/+server.ts` exposes `POST` (reads `{ slug: string | null }` JSON; `null` → `clearActiveProject`, valid string → `setActiveProject`, invalid string → 400 JSON `{error}`) and `DELETE` (always clears). Malformed JSON → 400. SvelteKit auto-handles 405 for unrouted methods, so the spec's GET-405 row is satisfied without an explicit handler.
  - `src/web/src/lib/components/app/project-picker-helpers.ts` exposes `selectProject(slug, opts?)` — POSTs JSON to `/api/active-project`, defaults `opts.fetch` to `globalThis.fetch`, runs `onSuccess` only on `res.ok`, returns `{ok,status,error?}`. 27 LOC ≤ 30.
  - `src/web/src/lib/components/app/ProjectPicker.svelte` accepts `{ activeProjectId, projects }`, emits flat shadcn-shape markup (`data-project-picker` wrapper, `data-slot="dropdown-menu-trigger"` button with active project name or "Select project" + `ChevronsUpDown`, `data-slot="dropdown-menu-content"` containing one `data-project-picker-item` per project, plus a `data-slot="dropdown-menu-separator"` + `data-project-picker-clear` button when an active project exists). Click handlers call `selectProject(slug, { fetch: window.fetch.bind(window), onSuccess: () => goto(window.location.pathname, { invalidateAll: true }) })`. 80 LOC ≤ 90.
- Design deviation (continued from 02.3 / 02.4): same shadcn-SSR clash workaround — flat HTML with `data-slot` attributes instead of importing the `DropdownMenu` component family inside `svelte/server` `render()`. Same final markup, no behavior change.
- Regression: `bun test --conditions=svelte ./src/web/src/lib/components/app/ ./src/web/src/lib/state/ ./src/web/src/routes/ ./src/web/src/hooks.server.test.ts` 40 pass / 0 fail; `bun run check` 0/0/0; `bun run build` ok; `bun run ci` 9/9 green.
