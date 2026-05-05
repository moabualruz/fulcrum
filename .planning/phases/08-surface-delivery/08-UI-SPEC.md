# Phase 08: Surface Delivery - UI Spec

**Created:** 2026-05-06  
**Status:** Ready for planning

## Scope

UI work in Phase 08 is completion and parity verification. Do not redesign the product. Use existing shadcn-svelte/Bits UI patterns and existing route layout.

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

## CLI Contract

- Human output: concise tables/summaries.
- JSON output: stable schemas from tRPC outputs; no explanatory text mixed into JSON.
- Error output: structured JSON when `--json`; human-readable message otherwise.

## API Contract

- OpenAPI spec available and validated.
- Error shapes are stable.
- Rate-limit headers visible.

## UI-SPEC COMPLETE
