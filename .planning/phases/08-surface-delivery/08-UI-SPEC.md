# Phase 08: Surface Delivery - UI Spec

**Created:** 2026-05-06  
**Status:** Ready for planning

## Scope

UI work in Phase 08 is completion and parity verification. Do not redesign the product. Use existing shadcn-svelte/Bits UI patterns and existing route layout.

## Huashu-Design Gate

Use `$huashu-design` as a focused design gate, not as a broad redesign workflow.

Relevant nested references:

- `/Users/mkh/.agents/skills/huashu-design/references/workflow.md` — Junior Designer workflow: assumptions/placeholders first, show early, then refine.
- `/Users/mkh/.agents/skills/huashu-design/references/design-context.md` — extract exact design context from existing codebase before high-fidelity UI decisions.
- `/Users/mkh/.agents/skills/huashu-design/references/critique-guide.md` — 5-axis expert review: philosophy alignment, visual hierarchy, craft, functionality, originality.
- `/Users/mkh/.agents/skills/huashu-design/references/verification.md` — Playwright/browser screenshot and console-error validation.

Apply it at two moments:

1. **Before TUI rewrite (`08-05`)**: create or review an HTML/TUI composition prototype for navigation, live run monitor, status footer, and density. This is a design-direction gate for OpenTUI layout.
2. **Before Web UAT finalization (`08-06`)**: run expert review on existing Web routes to catch hierarchy, density, craft, and anti-AI-slop issues. Do not redesign routes unless review finds blocking usability/craft problems.

Skip Huashu animation/video/export paths. Phase 08 needs product-surface UX review, not motion graphics.

## Web Contract

- Keep dense operational surfaces: route pages should prioritize tables, lists, forms, status badges, filters, split panes, and detail pages.
- Required journeys must pass through existing pages:
  - first-time setup
  - project CRUD
  - task CRUD
  - kanban move
  - sprint management
  - doc CRUD
  - doc editing
  - search + facets
  - memory browse
  - repo management
  - artifact download
  - notification rules
  - agent dispatch
  - theme customization
- Use existing shadcn-svelte components in `src/web/src/lib/components/ui/`.
- No hero pages, decorative cards, or marketing layouts.

## TUI Contract

- Top-level navigation: Projects, Tasks, Docs, Memory, Runs, Repos, Artifacts, Search, Notifications, Routing/Skills, Doctor/Settings.
- OpenTUI gate first. Layout after gate:
  - left nav or tab rail
  - main list/table pane
  - detail/log pane for selected item
  - persistent status footer
- Keyboard:
  - arrow keys and `j/k` move selection
  - `Enter` opens/selects
  - `Esc` backs out
  - `/` focuses search/filter
  - `q` exits only from root or explicit quit state
- Live run monitor:
  - run list left
  - current transcript/log right
  - metadata/status footer
  - updates through subscription/EventBus path when available

### Huashu-Design Gate: TUI Composition Findings

**Assumptions:** Fulcrum TUI is for repeated operator use inside active repositories. It must be keyboard-first, dense, low-decoration, and optimized for scanning operational state. It must avoid hero, marketing, and card-heavy composition.

**Existing vocabulary extracted from code:** status bars (`Renderer.statusBar`), inverse selected nav rows (`Renderer.navItem`), section separators, compact `j/k` and arrow hints, domain screen labels (`Projects`, `Tasks`, `Docs`, `Memory`, `Runs`, `Repos`, `Artifacts`, `Search`, `Notifications`, `Routing/Skills`, `Doctor/Settings`), and live logs from `RunsScreen`/`RunDetailScreen`.

**Target composition:** one persistent domain nav rail, one list/table pane, one detail/log pane, and one persistent status footer. Runs use a left run list and a right transcript/log pane; other domains use the same list/detail grammar with empty and error states.

**Huashu critique score:**
- Philosophy alignment: 8/10 — terminal-native operational density matches Fulcrum's local-first Agent OS direction.
- Visual hierarchy: 8/10 — domain nav, selected row, list/table pane, detail/log pane, and status footer create clear scanning order.
- Craft: 7/10 — acceptable when spacing stays on a compact 2-space terminal grid and all hints remain stable across screens.
- Functionality: 8/10 — every visible region maps to operator tasks: navigate, inspect, act, monitor.
- Originality: 7/10 — follows opencode/OpenTUI terminal app pattern without copying decorative web dashboard tropes.

**Implementation rules from gate:**
- Tests must assert domain nav, detail/log pane, and status footer text.
- Navigation keys must include `j`, `k`, arrow up/down, `Enter`, `Escape`, `/`, and root-only `q`.
- Run monitor must show `Run list`, `Transcript / log`, and status footer metadata.
- Command palette must expose `Create task`, `Create doc`, `Search`, `Dispatch run`, and `Settings`.
- Do not introduce decorative hero panels, nested cards, gradient ornaments, or explanatory marketing text.

## CLI Contract

- Human output: concise tables/summaries.
- JSON output: stable schemas from tRPC outputs; no explanatory text mixed into JSON.
- Error output: structured JSON when `--json`; human-readable message otherwise.

## API Contract

- OpenAPI spec available and validated.
- Error shapes are stable.
- Rate-limit headers visible.

## UI-SPEC COMPLETE
