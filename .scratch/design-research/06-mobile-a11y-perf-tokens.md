# Fulcrum UX Research 06 — Mobile, Accessibility, Performance, Offline, Tokens

> Cross-cluster deep dive: mobile responsive patterns, WCAG 2.2 AA + screen-reader posture, performance budgets, offline-first PWA, design tokens. Output is a synthesis intended to drive Fulcrum's foundation work, with verbatim adoptions, adaptations for a local-first desktop-leaning ops product, and traps to avoid. All citations are inline with working URLs at end-of-section.

---

## 1. Mobile responsive — what 7+ platforms actually do

### Reference patterns

**Tailwind CSS** ships a deliberately small mobile-first breakpoint ladder: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`, `2xl 1536px`, with the explicit rule that unprefixed utilities apply at every size and prefixed ones cascade upward — Tailwind's docs are blunt that `sm:text-center` does **not** center on mobile, it centers from 640 px and up [1]. v4 ships OKLCH-default colors, automatic content detection, and core `@container`/`@min-*`/`@max-*` container-query support; full builds went from 378 ms to 100 ms and incrementals from 44 ms to 5 ms — order-of-magnitude wins that change what a developer can iterate on per minute [2]. Container queries are now first-class for component-level adaptation independent of viewport [3].

**Apple Human Interface Guidelines** anchor a separate compatibility surface: minimum tap target **44×44 pt** (well above WCAG 2.2's 24×24 CSS-px floor), safe-area insets around notch/home indicator, Dynamic Type semantic font sizes (`largeTitle`, `body`, `caption`), and adaptive layouts driven by size classes [4]. Apple's system colors are not values, they are **roles** — `label`, `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`, `systemBackground` with secondary/tertiary tiers, `systemGroupedBackground`, and four `systemFill` tiers — that flip automatically for light/dark and respond to the **Increase Contrast** accessibility toggle [5]. This is the cleanest semantic surface in the industry and Fulcrum's token system should imitate it.

**Material Design 3** uses Window Size Classes (compact / medium / expanded / large / extra-large) keyed off width. Compact (< 600 dp) collapses navigation to a bottom bar, suppresses persistent rails, prefers single-pane content [6]. M3's color system uses tonal palettes generated from a seed and exposes role-based tokens — `primary`, `secondary`, `tertiary`, `surface`, `error`, each with `on-*` counterparts for legible content and `*-container`/`on-*-container` softer pairs for layered hierarchy [7].

**shadcn-svelte** mirrors shadcn/ui's `background`/`foreground` pattern, exposes semantic CSS variables (`primary`, `secondary`, `accent`, `muted`, `destructive`, `card`, `border`, `input`, `ring`), uses OKLCH by default, and flips dark mode via a `.dark` class selector with identical token names [8].

**GitHub Mobile** is the canonical "thin native client for a power-user web product" — tab-based navigation with a bottom Profile tab (long-press for enterprise-account add), push notifications with explicit triage workflows, code search per repo, PR reviews and file editing, biometric/2FA, universal links so URLs route to the app [9]. Notion mobile and Linear mobile pages 404'd at fetch time, but the documented industry shape is identical: read-mostly with a few targeted write workflows (comment, status change, approval), aggressive caching, and explicit "save for offline" affordances.

### What Fulcrum adopts verbatim

- Tailwind v4 OKLCH default + CSS-first `@theme` directive — already on the roadmap; no contest.
- Tailwind breakpoint ladder `sm/md/lg/xl/2xl` at the standard pixel values, mobile-first.
- Container queries (`@container`) for components that render in both narrow drawer/sidebar and wide main-pane contexts (board cards, run-feed entries, doc-table rows) — far more correct than viewport queries for these cases [3].
- Apple-style semantic color roles: `label`/`secondary-label`/`tertiary-label`/`quaternary-label`, `surface`/`surface-secondary`/`surface-tertiary`, `fill`/`fill-secondary` (Apple's HIG layering is the cleanest precedent in industry [5]).
- M3-style `on-*` pairing for every accent color (`accent`/`on-accent`, `danger`/`on-danger`, etc.) so contrast pairs are guaranteed at the token layer [7].

### What Fulcrum adapts

- Fulcrum's primary surface is desktop. Mobile is **read-mostly**: triage notifications, glance run status, approve/reject a gate, comment, mark a task done, capture a quick note. Heavy authoring (multi-pane doc edit, complex board drag) stays desktop. GitHub Mobile's split [9] is the right reference, not Notion's full-feature mobile editor.
- Add an **xs breakpoint at 480 px** in addition to Tailwind defaults — Fulcrum's run-feed and task-board cards collapse to single-column below 480 px (true phone portrait), and that boundary deserves a name. Keep Tailwind's existing five above it.
- Tap targets default to **40×40 px** (above WCAG 24×24 floor [10], below Apple's 44×44, suitable for desktop-leaning UI where most tap surfaces are still mouse-driven). Bump to 44×44 inside `@container` mobile contexts or under `(pointer: coarse)` media query.

### Traps to avoid

- Do **not** ship a separate mobile-only route tree or a "mobile site" subdomain. SvelteKit + container queries + Tailwind v4 makes responsive cheap; route forking doubles maintenance.
- Do **not** prefix every component with `sm:` / `md:` reactively — design mobile-first, layer up. Tailwind's docs are explicit that backwards usage is the most common mistake [1].
- Do **not** use viewport breakpoints to decide component layout when the component is rendered in panels of varying width. Use `@container` [3].

**Citations:** [1] https://tailwindcss.com/docs/responsive-design · [2] https://tailwindcss.com/blog/tailwindcss-v4 · [3] https://tailwindcss.com/docs/container-queries · [4] https://developer.apple.com/design/human-interface-guidelines/ · [5] https://developer.apple.com/design/human-interface-guidelines/color · [6] https://m3.material.io/foundations/layout/applying-layout/compact · [7] https://m3.material.io/styles/color/system/overview · [8] https://www.shadcn-svelte.com/docs/theming · [9] https://docs.github.com/en/get-started/using-github/github-mobile · [10] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

---

## 2. Accessibility — WCAG 2.2 AA + agents-as-users

### What's actually required at AA in 2.2

WCAG 2.2 was published 2024-12-12 [11]. New AA criteria that **must** be in Fulcrum's baseline:

- **2.4.11 Focus Not Obscured (Minimum)** — when a control receives keyboard focus, it must not be entirely hidden by author-created overlays (sticky headers, cookie banners) [11].
- **2.5.7 Dragging Movements** — every drag interaction needs a single-pointer non-path alternative unless dragging is fundamentally necessary [11]. Fulcrum's board and rank lists must support keyboard reorder + a context-menu "move to" fallback.
- **2.5.8 Target Size (Minimum)** — 24×24 CSS px floor with five exceptions (inline, user-agent default, equivalent control, essential, spacing-compensated via 24 px imaginary-circle non-overlap) [10].
- **3.3.7 Redundant Entry** (A) — do not require re-entering data the user already supplied unless essential [11].
- **3.3.8 Accessible Authentication (Minimum)** — auth flows cannot depend solely on object recognition, character typing, or puzzle-solving unless an alternative exists [11].

Existing AA criteria stay: 1.4.3 contrast 4.5:1 normal / 3:1 large text; 1.4.10 reflow at 320 CSS px wide; 1.4.11 non-text contrast 3:1; 2.1.1 keyboard operability; 2.4.7 focus visible [11]. Atlassian's foundations restate the same contrast pair explicitly [12]. GOV.UK Design System reminds teams that using a system "does not immediately make that service accessible" — the system gives accessible primitives, the team still owns research, design, and test [13].

### Headless primitives Fulcrum should sit on top of

Three options, all WAI-ARIA APG-aligned:

- **Bits UI** — 40+ headless Svelte 5 primitives, full WAI-ARIA compliance, keyboard nav, focus management, screen-reader support; explicit `class` and `data-*` API; render delegation [14].
- **Melt UI** — builder-functions architecture, accessibility-first, zero predefined styles, TypeScript-strict, SSR-ready [15].
- **Radix Primitives** — WAI-ARIA APG tested across browsers and assistive tech, programmatic focus management (e.g. dialog open moves focus to first focusable child), tested labels, all the dialog/menu/popover semantics [16].

shadcn-svelte already builds on Bits UI; Fulcrum can adopt that stack and inherit a11y posture without bespoke ARIA work.

### Reduced motion + forced colors

- `prefers-reduced-motion: reduce` is baseline-widely-available since January 2020 [17]. Every Fulcrum transition with non-trivial motion (drawer slide, board card move, modal scale-in) must collapse to an opacity-only or instant transition under reduce. Pattern is mature: define the loud animation as default, override under the media query [17].
- `forced-colors: active` (Windows High Contrast) became baseline 2022 [18]. The browser forces `color`, `background-color`, `border-color`, `outline-color`, and SVG `fill`/`stroke` to system colors; `box-shadow`, `text-shadow`, and most `background-image` are forced to `none` [18]. Fulcrum components that rely on shadow for affordance (button depth, card elevation) must add a `border: 1px ButtonText solid` fallback under `@media (forced-colors: active)` so the affordance survives.

### Agents-as-users

A semi-novel angle for an Agent OS: agents read the same DOM. Two practical implications:

- **Semantic HTML + ARIA labels are dual-purpose.** They make the product navigable by screen readers and by Claude/Codex/etc. when they read the DOM via Playwright or accessibility-tree taps. A `<button>` with `aria-label="Approve gate run-1234"` is grep-friendly for agents.
- **Stable `data-testid` / `data-fulcrum-*` selectors** on every interactive primitive give agents deterministic handles that survive design changes. This is the same investment as Playwright test stability.

### What Fulcrum adopts verbatim

- WCAG 2.2 AA baseline, every new criterion above.
- Bits UI as the headless primitive layer (already implied by shadcn-svelte).
- `prefers-reduced-motion` + `forced-colors` overrides on every component that uses motion or shadow.
- Atlassian's contrast targets, GOV.UK's framing ("system gives primitives, team still owns").

### What Fulcrum adapts

- Tap target floor **24×24 CSS px (WCAG minimum)**, but **40×40 px default** under `(pointer: fine)`, **44×44 px under `(pointer: coarse)`** — gives keyboard/mouse users tight density without violating mobile a11y.
- Drag-and-drop on boards exposes a keyboard reorder mode (`j`/`k` to move within column, `h`/`l` to switch column, `Enter` to commit) — satisfies 2.5.7 and is faster than mouse for power users.

### Traps

- Do not rely on `tabindex > 0`. Use DOM order.
- Do not roll your own combobox / listbox / dialog — every team that tries gets focus return wrong [16].
- Do not use color alone to convey state (failed/passed run, blocked task). Add icon + text [12].
- Do not animate via `transform: scale()` over large areas without `prefers-reduced-motion` override [17].

**Citations:** [11] https://www.w3.org/TR/WCAG22/ · [12] https://atlassian.design/foundations/accessibility/ · [13] https://design-system.service.gov.uk/accessibility/ · [14] https://www.bits-ui.com/docs · [15] https://melt-ui.com/docs/introduction · [16] https://www.radix-ui.com/primitives/docs/overview/accessibility · [17] https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion · [18] https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors

---

## 3. Performance — what to budget and how to measure

### Core Web Vitals thresholds, current generation

Field-measured at p75:

- **LCP ≤ 2.5 s** (good); needs-improvement up to 4 s; poor beyond [19].
- **INP ≤ 200 ms** (good); 201–500 ms needs-improvement; > 500 ms poor [20]. Replaced FID in March 2024.
- **CLS ≤ 0.1** (good) [19].

INP measures the longest click/tap/keyboard interaction across the session (excluding statistical outliers), decomposed into input delay, processing duration, presentation delay [20]. Lab proxy is Total Blocking Time when real interactions aren't available [20].

### How to measure

- **Lighthouse** for lab (5 categories: Performance, Accessibility, Best Practices, SEO, a newer Agentic Browsing audit) — CLI, Node module, DevTools, PageSpeed Insights, or Chrome extension; integrates with Lighthouse CI to gate regressions [21].
- **Vercel Speed Insights** for RUM — Core Web Vitals at p75/p90/p95/p99 with route/path/element/country dimensions, Real Experience Score (RES) as the composite metric, Kanban view that lists routes needing work [22]. The product Fulcrum sits closest to operationally.

### SvelteKit-specific levers

SvelteKit's `page-options` give per-route knobs that change perf shape dramatically [23]:

- `export const prerender = true` — static HTML at build time, fastest delivery, smaller server manifest. Use for marketing pages, public docs, the `/about` route.
- `prerender = 'auto'` — prerendered yet still dynamically renderable.
- `ssr = false` — empty shell + client-only render; not recommended for SEO/a11y but valid for tightly app-shell-style routes.
- `csr = false` — no JS shipped; good for pure-content pages like `/changelog`.

Mix by route. Default: full SSR + CSR for app routes; prerender for marketing.

### Long lists: virtualization

**TanStack Virtual** ships `@tanstack/svelte-virtual` (in addition to React/Vue/Solid/Lit/Angular), 10–15 KB, 60 FPS, fixed/variable/dynamic sizing, vertical/horizontal/grid/window-scroll [24]. Fulcrum's run feed, task list, doc table, audit log, MCP registry browser — all candidates. Mount cost goes from O(rows) to O(visible-rows).

### What Fulcrum adopts verbatim

- Core Web Vitals targets above as the baseline; INP gets first-class attention because Fulcrum is interactive (keyboard shortcuts, drag, command palette).
- Lighthouse CI as a gate in `bun run ci` (already partially planned).
- `@tanstack/svelte-virtual` for every list that can exceed ~50 rows.
- Prerender for marketing/docs/changelog; SSR + CSR everywhere else.

### Per-route performance budgets (recommended, conservative)

| Route archetype | JS gz | CSS gz | LCP p75 | INP p75 | CLS | FCP |
|---|---|---|---|---|---|---|
| `/` landing, `/docs/*` (prerendered) | 60 KB | 12 KB | ≤ 1.5 s | ≤ 100 ms | ≤ 0.05 | ≤ 1.0 s |
| `/app/board/:id` (board view) | 180 KB | 20 KB | ≤ 2.0 s | ≤ 150 ms | ≤ 0.05 | ≤ 1.2 s |
| `/app/run/:id` (run feed, streaming) | 160 KB | 18 KB | ≤ 2.0 s | ≤ 150 ms | ≤ 0.05 | ≤ 1.2 s |
| `/app/doc/:id` (doc editor) | 250 KB | 22 KB | ≤ 2.5 s | ≤ 200 ms | ≤ 0.1 | ≤ 1.5 s |
| `/app/doctor` (diagnostic) | 120 KB | 16 KB | ≤ 1.8 s | ≤ 150 ms | ≤ 0.05 | ≤ 1.0 s |
| modal, drawer (in-route) | +20 KB | +4 KB | n/a | ≤ 150 ms | ≤ 0.02 | n/a |

Tracked via Lighthouse CI assertions + Speed Insights RUM gate.

### Traps

- Do not measure INP in lab only. INP needs real interactions; lab proxy TBT is approximate [20].
- Do not bundle the doc editor on the landing route. Code-split by route via SvelteKit's automatic per-route chunking; lazy-load heavy components (CodeMirror, board DnD, charts).
- Do not naively render 10 000 rows. Virtualize. [24]
- Do not animate `top`/`left`/`width`. Animate `transform`/`opacity`. Composited.

**Citations:** [19] https://web.dev/articles/vitals · [20] https://web.dev/articles/inp · [21] https://developer.chrome.com/docs/lighthouse/overview · [22] https://vercel.com/docs/speed-insights · [23] https://svelte.dev/docs/kit/page-options · [24] https://tanstack.com/virtual/latest

---

## 4. Offline-first PWA — what to cache, what to queue

### Caching strategies (Workbox vocabulary)

The web.dev Offline Cookbook lays out the canonical strategies [25]:

- **Cache-First** — check cache, fall back to network. Use for immutable static assets (hashed JS/CSS/fonts/icons).
- **Network-First** — try network, fall back to cache. Use for HTML pages, API reads where freshness matters.
- **Cache-Then-Network** — fire both, render cache immediately, swap when network returns. Use for primary user-facing data (run feed, task list) to avoid blank screens.
- **Stale-While-Revalidate** — return cache immediately, fetch network in background to update cache for next visit. Use for non-critical reads (avatars, search history).
- **Cache-Only / Network-Only** — niche; use cache-only for app shell during offline boot.

Workbox is the production-ready library wrapping these patterns, with first-class background sync support and navigation preload [26].

### Storage-timing patterns

- **On install** — cache the app shell (HTML, root JS/CSS bundles, offline fallback page, icon set). If these miss, the app cannot render at all [25].
- **On network response** — cache as users browse (run pages they visit, docs they open) [25].
- **On user interaction** — explicit "Make available offline" button for a doc or board [25].
- **On background sync** — queue writes for replay when reconnected [25].

### What Fulcrum adopts

Service worker scope: the entire `/app/*` namespace. Marketing (`/`, `/docs/*`) stays prerendered and doesn't need SW caching beyond default browser caching.

**Cache buckets (named, versioned):**

1. `app-shell-v{N}` — HTML shell, root JS/CSS, fonts, icons. Cache-first, precached on install.
2. `api-reads-v{N}` — `GET /trpc/*` responses for read queries. Network-first with 5-second timeout, fall back to cache, hard-cap 50 MB / 7-day TTL.
3. `static-v{N}` — fingerprinted assets. Cache-first, immutable.
4. `runtime-v{N}` — avatars, attachments. Stale-while-revalidate.

**Offline queue shape (writes):**

Only **safe, idempotent writes** are queued. Anything that mutates shared state irreversibly stays online-only. Concrete allowlist:

- Comment / note add (idempotent via client-generated ULID).
- Task status update (idempotent via last-write-wins on `updatedAt`).
- Doc edit (CRDT-friendly; queued ops merge on replay).
- Notification mark-as-read.
- Local task creation (with client-side ULID).

Concrete denylist:

- Run start / agent invocation (cost-incurring, side-effecting).
- Permission grants, MCP registry add/remove.
- Destructive ops: delete repo, delete project, force-merge.
- Anything touching external integrations (Slack post, GitHub PR).

Queue entry shape (IndexedDB-backed):

```jsonc
{
  "id": "01J...ULID",
  "op": "task.update",
  "payload": { "id": "task_42", "status": "done", "updatedAt": "2026-05-17T..." },
  "createdAt": "2026-05-17T...",
  "attempts": 0,
  "maxAttempts": 5,
  "lastError": null
}
```

Replay on `online` event or via Background Sync API (`sync` event); exponential backoff; surface persistent failures in a "Queued Changes" tray in the UI so the user can inspect/retry/discard.

### PWA manifest

Required fields per web.dev [27]: `name`/`short_name`, icons (≥ 192×192 and ≥ 512×512; `purpose: "any maskable"` for Android adaptive), `start_url`, `display`, `theme_color`, `background_color`. Optional but recommended: `scope`, `description`, `screenshots`, `id`.

**Fulcrum manifest shape (concrete):**

```json
{
  "id": "/app/",
  "name": "Fulcrum",
  "short_name": "Fulcrum",
  "description": "Local-first Agent OS for repositories, tasks, agent runs, context, memory, and artifacts.",
  "start_url": "/app/",
  "scope": "/app/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "theme_color": "#0a0a0a",
  "background_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/board-desktop.png", "sizes": "1280x720", "form_factor": "wide" },
    { "src": "/screenshots/run-mobile.png", "sizes": "750x1334", "form_factor": "narrow" }
  ],
  "categories": ["productivity", "developer", "utilities"],
  "shortcuts": [
    { "name": "Doctor", "url": "/app/doctor", "icons": [{ "src": "/icons/doctor.png", "sizes": "96x96" }] },
    { "name": "Today", "url": "/app/today" }
  ]
}
```

**Install prompt timing:** do not call `beforeinstallprompt` on first load. Defer until the user has had two sessions or completed one meaningful action (task created, run started). Show a non-modal banner in the user menu, not a takeover dialog.

### Traps

- Do not blindly cache POST/PUT/DELETE responses. Service workers should only cache idempotent GETs.
- Do not queue agent-run invocations offline — they cost money and have external side effects.
- Do not skip a manual "clear cache" affordance in the Doctor surface. Users with stale SW state need a hammer.
- Do not ship a service worker without versioned cache names; orphaned old caches eat disk forever.

**Citations:** [25] https://web.dev/articles/offline-cookbook · [26] https://developer.chrome.com/docs/workbox/ · [27] https://web.dev/articles/add-manifest

---

## 5. Design tokens — OKLCH, semantic roles, JSON shape

### Why OKLCH

OKLCH replaces RGB/HSL because **perceived lightness is consistent across hues** [28][29]. HSL distorts: `hsl(60 100% 50%)` (yellow) reads far brighter than `hsl(240 100% 50%)` (blue) at the same nominal L. OKLCH fixes this — L is calibrated to perception, so darkening or lightening a color by a fixed delta yields the predictable visual change [28]. P3 gamut supports 30% more visible colors than sRGB; OKLCH encodes P3 directly and degrades gracefully to sRGB fallbacks [29]. Tailwind v4 defaults to OKLCH [2]; shadcn-svelte defaults to OKLCH [8]. The migration is industry-wide.

### Semantic role design

Three reference systems converge on the same shape:

- **Apple HIG** — `label`/`secondaryLabel`/`tertiaryLabel`/`quaternaryLabel`, `systemBackground`/secondary/tertiary, `systemGroupedBackground`/secondary, four `systemFill` tiers. Roles, not values. Adapts to Increase Contrast [5].
- **Material 3** — `primary`/`secondary`/`tertiary`/`error` × {base, on-, container, on-container} × surface tiers [7].
- **shadcn-svelte** — `background`/`foreground`, `card`/`card-foreground`, `primary`/`primary-foreground`, `secondary`/`secondary-foreground`, `muted`/`muted-foreground`, `accent`/`accent-foreground`, `destructive`/`destructive-foreground`, `border`, `input`, `ring`, chart, sidebar variants [8].

Fulcrum's token surface is the union: Apple's layered surfaces, M3's `on-*` rigor, shadcn's developer ergonomics.

### Token JSON shape — Fulcrum recommendation

Concrete `tokens/fulcrum.tokens.json` (W3C Design Tokens Community Group format, single source for both light and dark via `$extensions.modes`):

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "surface": {
      "base":      { "$type": "color", "$value": "oklch(0.99 0.002 270)", "$extensions": { "modes": { "dark": "oklch(0.14 0.005 270)" } } },
      "elevated":  { "$type": "color", "$value": "oklch(1.00 0.000 270)", "$extensions": { "modes": { "dark": "oklch(0.18 0.005 270)" } } },
      "sunken":    { "$type": "color", "$value": "oklch(0.97 0.003 270)", "$extensions": { "modes": { "dark": "oklch(0.11 0.005 270)" } } },
      "overlay":   { "$type": "color", "$value": "oklch(0.99 0.002 270 / 0.92)", "$extensions": { "modes": { "dark": "oklch(0.14 0.005 270 / 0.92)" } } }
    },
    "fg": {
      "default":   { "$type": "color", "$value": "oklch(0.18 0.01 270)",  "$extensions": { "modes": { "dark": "oklch(0.96 0.005 270)" } } },
      "subtle":    { "$type": "color", "$value": "oklch(0.42 0.01 270)",  "$extensions": { "modes": { "dark": "oklch(0.72 0.005 270)" } } },
      "muted":     { "$type": "color", "$value": "oklch(0.58 0.01 270)",  "$extensions": { "modes": { "dark": "oklch(0.55 0.005 270)" } } },
      "disabled":  { "$type": "color", "$value": "oklch(0.72 0.01 270)",  "$extensions": { "modes": { "dark": "oklch(0.38 0.005 270)" } } },
      "inverse":   { "$type": "color", "$value": "oklch(0.99 0.002 270)", "$extensions": { "modes": { "dark": "oklch(0.14 0.005 270)" } } }
    },
    "border": {
      "default":   { "$type": "color", "$value": "oklch(0.90 0.005 270)", "$extensions": { "modes": { "dark": "oklch(0.28 0.005 270)" } } },
      "strong":    { "$type": "color", "$value": "oklch(0.78 0.005 270)", "$extensions": { "modes": { "dark": "oklch(0.42 0.005 270)" } } },
      "focus":     { "$type": "color", "$value": "oklch(0.62 0.18 250)",  "$extensions": { "modes": { "dark": "oklch(0.72 0.18 250)" } } }
    },
    "accent": {
      "base":      { "$type": "color", "$value": "oklch(0.62 0.18 250)",  "$extensions": { "modes": { "dark": "oklch(0.72 0.18 250)" } } },
      "hover":     { "$type": "color", "$value": "oklch(0.56 0.20 250)",  "$extensions": { "modes": { "dark": "oklch(0.78 0.18 250)" } } },
      "subtle":    { "$type": "color", "$value": "oklch(0.94 0.04 250)",  "$extensions": { "modes": { "dark": "oklch(0.24 0.06 250)" } } },
      "on":        { "$type": "color", "$value": "oklch(0.99 0.002 250)", "$extensions": { "modes": { "dark": "oklch(0.10 0.005 250)" } } }
    },
    "danger": {
      "base":      { "$type": "color", "$value": "oklch(0.58 0.21 27)",   "$extensions": { "modes": { "dark": "oklch(0.68 0.21 27)" } } },
      "subtle":    { "$type": "color", "$value": "oklch(0.95 0.04 27)",   "$extensions": { "modes": { "dark": "oklch(0.26 0.08 27)" } } },
      "on":        { "$type": "color", "$value": "oklch(0.99 0.002 27)",  "$extensions": { "modes": { "dark": "oklch(0.10 0.005 27)" } } }
    },
    "warn": {
      "base":      { "$type": "color", "$value": "oklch(0.78 0.16 80)",   "$extensions": { "modes": { "dark": "oklch(0.82 0.16 80)" } } },
      "subtle":    { "$type": "color", "$value": "oklch(0.96 0.05 80)",   "$extensions": { "modes": { "dark": "oklch(0.28 0.08 80)" } } },
      "on":        { "$type": "color", "$value": "oklch(0.18 0.01 80)",   "$extensions": { "modes": { "dark": "oklch(0.10 0.005 80)" } } }
    },
    "success": {
      "base":      { "$type": "color", "$value": "oklch(0.64 0.16 145)",  "$extensions": { "modes": { "dark": "oklch(0.72 0.16 145)" } } },
      "subtle":    { "$type": "color", "$value": "oklch(0.94 0.05 145)",  "$extensions": { "modes": { "dark": "oklch(0.24 0.08 145)" } } },
      "on":        { "$type": "color", "$value": "oklch(0.99 0.002 145)", "$extensions": { "modes": { "dark": "oklch(0.10 0.005 145)" } } }
    }
  },
  "radius": {
    "xs": { "$type": "dimension", "$value": "2px" },
    "sm": { "$type": "dimension", "$value": "4px" },
    "md": { "$type": "dimension", "$value": "6px" },
    "lg": { "$type": "dimension", "$value": "10px" },
    "xl": { "$type": "dimension", "$value": "16px" }
  },
  "space": {
    "0": { "$type": "dimension", "$value": "0px" },
    "1": { "$type": "dimension", "$value": "4px" },
    "2": { "$type": "dimension", "$value": "8px" },
    "3": { "$type": "dimension", "$value": "12px" },
    "4": { "$type": "dimension", "$value": "16px" },
    "6": { "$type": "dimension", "$value": "24px" },
    "8": { "$type": "dimension", "$value": "32px" }
  }
}
```

Compiled CSS (Tailwind v4 `@theme` block, `app.css`):

```css
@import "tailwindcss";

@theme {
  --color-surface:           oklch(0.99 0.002 270);
  --color-surface-elevated:  oklch(1.00 0.000 270);
  --color-surface-sunken:    oklch(0.97 0.003 270);
  --color-surface-overlay:   oklch(0.99 0.002 270 / 0.92);

  --color-fg:                oklch(0.18 0.01 270);
  --color-fg-subtle:         oklch(0.42 0.01 270);
  --color-fg-muted:          oklch(0.58 0.01 270);
  --color-fg-disabled:       oklch(0.72 0.01 270);
  --color-fg-inverse:        oklch(0.99 0.002 270);

  --color-border:            oklch(0.90 0.005 270);
  --color-border-strong:     oklch(0.78 0.005 270);
  --color-border-focus:      oklch(0.62 0.18 250);

  --color-accent:            oklch(0.62 0.18 250);
  --color-accent-hover:      oklch(0.56 0.20 250);
  --color-accent-subtle:     oklch(0.94 0.04 250);
  --color-on-accent:         oklch(0.99 0.002 250);

  --color-danger:            oklch(0.58 0.21 27);
  --color-danger-subtle:     oklch(0.95 0.04 27);
  --color-on-danger:         oklch(0.99 0.002 27);

  --color-warn:              oklch(0.78 0.16 80);
  --color-warn-subtle:       oklch(0.96 0.05 80);
  --color-on-warn:           oklch(0.18 0.01 80);

  --color-success:           oklch(0.64 0.16 145);
  --color-success-subtle:    oklch(0.94 0.05 145);
  --color-on-success:        oklch(0.99 0.002 145);

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  --breakpoint-xs: 30rem;
}

.dark {
  --color-surface:           oklch(0.14 0.005 270);
  --color-surface-elevated:  oklch(0.18 0.005 270);
  --color-surface-sunken:    oklch(0.11 0.005 270);
  --color-surface-overlay:   oklch(0.14 0.005 270 / 0.92);

  --color-fg:                oklch(0.96 0.005 270);
  --color-fg-subtle:         oklch(0.72 0.005 270);
  --color-fg-muted:          oklch(0.55 0.005 270);
  --color-fg-disabled:       oklch(0.38 0.005 270);
  --color-fg-inverse:        oklch(0.14 0.005 270);

  --color-border:            oklch(0.28 0.005 270);
  --color-border-strong:     oklch(0.42 0.005 270);
  --color-border-focus:      oklch(0.72 0.18 250);

  --color-accent:            oklch(0.72 0.18 250);
  --color-accent-hover:      oklch(0.78 0.18 250);
  --color-accent-subtle:     oklch(0.24 0.06 250);
  --color-on-accent:         oklch(0.10 0.005 250);

  --color-danger:            oklch(0.68 0.21 27);
  --color-danger-subtle:     oklch(0.26 0.08 27);
  --color-on-danger:         oklch(0.10 0.005 27);

  --color-warn:              oklch(0.82 0.16 80);
  --color-warn-subtle:       oklch(0.28 0.08 80);
  --color-on-warn:           oklch(0.10 0.005 80);

  --color-success:           oklch(0.72 0.16 145);
  --color-success-subtle:    oklch(0.24 0.08 145);
  --color-on-success:        oklch(0.10 0.005 145);
}

@media (forced-colors: active) {
  :root { --color-border: CanvasText; --color-border-focus: Highlight; }
  button, [role="button"] { border: 1px solid ButtonText; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```

Atlassian's token catalog [30] and Radix Colors' twelve-step scale (1–2 backgrounds, 3–5 component backgrounds, 6–8 borders/separators, 9–10 solid backgrounds, 11–12 text [31]) are good cross-references; the shape above is intentionally smaller because Fulcrum prefers semantic roles over numbered scales — the role names self-document at call sites.

**Citations:** [28] https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl · [29] https://oklch.com/ · [30] https://atlassian.design/tokens/all-design-tokens · [31] https://www.radix-ui.com/colors/docs/overview/installation

---

## 6. Concrete recommendations summary

### Breakpoint set

| Name | Min width | Use |
|---|---|---|
| `xs` | 30rem (480px) | Phone portrait; single-column collapse |
| `sm` | 40rem (640px) | Phone landscape / large phone |
| `md` | 48rem (768px) | Tablet portrait; two-pane optional |
| `lg` | 64rem (1024px) | Tablet landscape / small laptop; three-pane default |
| `xl` | 80rem (1280px) | Desktop; full IA visible |
| `2xl` | 96rem (1536px) | Wide desktop; max content width caps to keep line length sane |

**Container queries** mandatory for: board cards, run-feed entries, doc-table rows, sidebar widgets, command palette result rows — any component that renders in both narrow and wide contexts.

### WCAG compliance checklist per screen archetype

**Board** — keyboard reorder (`j`/`k`/`h`/`l`/`Enter`) satisfies 2.5.7 dragging alternative; card focus ring visible + not obscured (2.4.7, 2.4.11); 24×24 px target floor on every card action (2.5.8); column ARIA `role="region"` with labelled-by header; live-region announce on card move.

**Doc editor** — semantic headings, never skip levels (1.3.1); selection contrast 3:1 (1.4.11); keyboard shortcut help reachable via `?` (3.2.6 consistent help); autosave preserves draft on tab close (3.3.4 error prevention); reduced-motion collapses smooth-scroll on paragraph add.

**Run feed** — streaming updates use `aria-live="polite"` with throttling so SR isn't spammed; each run row has `aria-label` summarising state for agents and screen readers; status conveyed by icon + text + color (not color alone, 1.4.1); focus survives DOM rewrites on stream.

**Doctor** — every check is a button or expandable region with explicit `aria-expanded`; error/warn states have icon + text + color; copy-to-clipboard buttons have `aria-label` with target description (3.3.7 redundant entry — pre-populated from check result).

**Modal** — focus moves into modal on open, returns to invoker on close (Bits UI handles this [14]); `Escape` closes; focus trap; `aria-modal="true"` and `aria-labelledby`; not obscured (2.4.11) by sticky elements.

**Drawer** — same as modal plus: keyboard-open shortcut documented, `aria-expanded` on toggle, drawer width capped so main content remains usable per 1.4.10 reflow at 320 px.

### Performance budget per route

See table in Section 3 above. Gates: Lighthouse CI assertions in `bun run ci`, Speed Insights RUM alarms on regression > 10% week-over-week.

### Service worker scope + offline queue

- **Scope:** `/app/*`. Marketing prerendered, not in SW.
- **Buckets:** `app-shell-v{N}` (cache-first, install), `api-reads-v{N}` (network-first 5 s timeout, 50 MB / 7-day TTL), `static-v{N}` (cache-first, immutable), `runtime-v{N}` (stale-while-revalidate).
- **Queue allowlist:** comment/note add, task status update, doc edit, mark-as-read, local task create. All idempotent via client-generated ULIDs.
- **Queue denylist:** agent runs, permission grants, MCP registry mutations, destructive ops, external integrations.
- **Replay:** `online` event or Background Sync `sync` event; exp backoff; surface failures in "Queued Changes" tray in user menu with inspect/retry/discard.

### PWA manifest

See Section 4 JSON. Highlights: `display: standalone` with `display_override` for window-controls-overlay on desktop, `start_url` and `scope` both `/app/`, both `any` and `maskable` icons at 192/512, two screenshots (wide + narrow), category `productivity` + `developer`, two shortcuts (`Doctor`, `Today`). Install prompt deferred to second session or first meaningful action.

### Design token file

See Section 5 JSON + CSS. Highlights: OKLCH triplets, semantic roles (`surface`/`fg`/`border`/`accent`/`danger`/`warn`/`success` plus `subtle`/`hover`/`on-*` pairs), W3C DTCG-compatible JSON with `$extensions.modes.dark`, compiled to Tailwind v4 `@theme` + `.dark` override, plus `@media (forced-colors: active)` and `@media (prefers-reduced-motion: reduce)` global guards.

---

## Citation index

1. Tailwind CSS responsive design — https://tailwindcss.com/docs/responsive-design
2. Tailwind CSS v4 blog — https://tailwindcss.com/blog/tailwindcss-v4
3. Tailwind container queries — https://tailwindcss.com/docs/container-queries
4. Apple Human Interface Guidelines — https://developer.apple.com/design/human-interface-guidelines/
5. Apple system colors — https://developer.apple.com/design/human-interface-guidelines/color
6. Material 3 compact layout — https://m3.material.io/foundations/layout/applying-layout/compact
7. Material 3 color system — https://m3.material.io/styles/color/system/overview
8. shadcn-svelte theming — https://www.shadcn-svelte.com/docs/theming
9. GitHub Mobile docs — https://docs.github.com/en/get-started/using-github/github-mobile
10. WCAG 2.5.8 Target Size — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
11. WCAG 2.2 — https://www.w3.org/TR/WCAG22/
12. Atlassian accessibility foundations — https://atlassian.design/foundations/accessibility/
13. GOV.UK Design System accessibility — https://design-system.service.gov.uk/accessibility/
14. Bits UI docs — https://www.bits-ui.com/docs
15. Melt UI introduction — https://melt-ui.com/docs/introduction
16. Radix Primitives accessibility — https://www.radix-ui.com/primitives/docs/overview/accessibility
17. MDN prefers-reduced-motion — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
18. MDN forced-colors — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
19. web.dev Core Web Vitals — https://web.dev/articles/vitals
20. web.dev INP — https://web.dev/articles/inp
21. Chrome Lighthouse overview — https://developer.chrome.com/docs/lighthouse/overview
22. Vercel Speed Insights — https://vercel.com/docs/speed-insights
23. SvelteKit page options — https://svelte.dev/docs/kit/page-options
24. TanStack Virtual — https://tanstack.com/virtual/latest
25. web.dev Offline Cookbook — https://web.dev/articles/offline-cookbook
26. Chrome Workbox — https://developer.chrome.com/docs/workbox/
27. web.dev PWA manifest — https://web.dev/articles/add-manifest
28. Evil Martians OKLCH — https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
29. OKLCH picker — https://oklch.com/
30. Atlassian design tokens — https://atlassian.design/tokens/all-design-tokens
31. Radix Colors install — https://www.radix-ui.com/colors/docs/overview/installation
