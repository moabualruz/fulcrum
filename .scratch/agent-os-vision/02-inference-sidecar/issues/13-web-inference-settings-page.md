---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 09-classify-and-tokenize, 11-per-feature-backend-routing-config, 12-external-llm-provider-flag
---

# Web inference settings page — full `+page.svelte` with all panels

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Assemble the complete `src/web/src/routes/settings/inference/+page.svelte` and `+page.server.ts` — all panels in their final form: active backend badge (global nav), backend status card, per-feature routing selectors, model list with pull/rm controls + download progress overlay (tRPC SSE subscription), cache stats (hit rate, size, clear button), test panels (embed / generate / classify / tokenize), external LLM provider card (flag-gated). Backend badge (green/yellow/red) added to global nav polling `inference.health` every 30 s.

## Acceptance criteria
- [ ] Web/API surface: `+page.svelte` renders all panels without JS errors; `+page.server.ts` calls `inference.health` + `inference.models.list` + `inference.backends.list`; page loads under 1 s with sidecar running; graceful degradation (error cards) when sidecar down.
- [ ] Web/API surface: backend badge in global nav shows green/yellow/red based on `inference.health` status; updates within 31 s of backend going down.
- [ ] Web/API surface: "Download" button on undownloaded model triggers `inference.models.pull` SSE subscription; progress bar overlay renders 0→100%; model row updates to "Downloaded" on completion; "Remove" triggers `inference.models.rm` with confirmation dialog.
- [ ] CLI command: all CLI commands from prior slices remain green (regression check: `fulcrum inference status --json`, `embed`, `generate`, `models list`).
- [ ] TUI screen: N/A at this slice; TUI inference dashboard is slice 14.
- [ ] Tests: Playwright E2E — settings → inference: backend badge visible; model list renders at least one row; "Test embed" round-trip returns 384 dims; "Test generate" returns text; progress overlay appears on pull click; all assertions pass with real binary via `SKIP_MODEL_DOWNLOAD=1`. `bun run ci` green.

## Blocked by
09-classify-and-tokenize, 11-per-feature-backend-routing-config, 12-external-llm-provider-flag

## Notes
- SSE subscription for model pull: SvelteKit uses `EventSource` client-side consuming tRPC subscription endpoint.
- Cache stats: call `inference.health()` which should include `cache: { embed_hit_rate, gen_hit_rate, db_size_bytes }`; Rust `health()` must be updated to include cache stats (regression in slice 01 health response — add here).
- External LLM provider card conditionally rendered: `{#if isEnabled('external-llm-provider')}`.
- Page uses SvelteKit `load` function (server-side) for initial data; client subscribes to health polling after hydration.
