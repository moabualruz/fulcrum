---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 13-web-inference-settings-page
---

# TUI inference dashboard — backend status, model list, in-flight ops, throughput

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Build the full OpenTUI Settings → Inference screen: backend status header (green/yellow/red badge + active backend name), model list table (model ID, kind, downloaded, size, action buttons), in-flight operations counter (active embed/generate requests), throughput gauge (ops/s rolling 10-s window sourced from `inference.health` stats), cache stats row (embed hit rate, gen hit rate, DB size), download progress bar overlay during `inference.models.pull` subscription. Per-feature backend routing selectors (dropdowns). `fulcrum tui` launches with this screen navigable from the Settings section.

## Acceptance criteria
- [ ] TUI screen: `fulcrum tui` → Settings → Inference renders without panic; backend status badge correct color; model list shows at least one row (downloaded or not); in-flight ops counter shows 0 at idle; throughput gauge renders (0 ops/s at idle).
- [ ] TUI screen: per-feature backend routing dropdowns function — selecting a backend calls `inference.config.set()` tRPC mutation; dropdowns show gated backends as disabled.
- [ ] TUI screen: download progress bar overlay appears when `inference.models.pull` subscription active; updates pct; dismisses at 100%.
- [ ] CLI command: `fulcrum tui` (entry point) navigates to inference screen without regression; `fulcrum inference status --json` still works from CLI (not TUI regression).
- [ ] Web/API surface: N/A (web page completed in slice 13); regression check: web settings page still loads without error.
- [ ] Tests: smoke test (headless OpenTUI render test or snapshot): opens inference screen, asserts backend badge rendered, model list component rendered, no crash; `bun test src/tui/__tests__/inference-screen.test.ts` green. `bun run ci` green.

## Blocked by
13-web-inference-settings-page

## Notes
- OpenTUI failure gate: if OpenTUI component library too immature for progress bars / dropdowns → fall back to ratatui (Rust TUI) sharing the `inference/` workspace; API surface unchanged.
- `inference.health` tRPC poll every 5 s in TUI (more frequent than web's 30 s — TUI is interactive).
- In-flight ops counter: `inference.health()` returns `{ active_requests: N }` — Rust sidecar tracks concurrent request count via `AtomicUsize`.
- Throughput: `inference.health()` returns `{ ops_last_10s: N }` — Rust sidecar maintains a rolling counter.
- This slice is the final pillar milestone: all three surfaces parity fully realized, `bun run ci` clean.
