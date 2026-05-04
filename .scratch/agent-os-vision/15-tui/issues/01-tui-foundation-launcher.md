---
Status: completed
Triage: AFK
Pillar: tui
Owner: codex-worker-tui-foundation
CoOwner: codex-worker-tui-runtime-auth
ReopenedAt: 2026-05-02T16:02:54Z
ReopenedBecause: Resume wave landed partial harness only; remaining work includes production auth container, local_telemetry DB insert, and renderer integration.
RepairProgressAt: 2026-05-02T16:24:24Z
RepairProgress: Production DB/auth container and local_telemetry insert fixed; issue stays in-progress for renderer/foundation parity work.
RepairCompletedAt: 2026-05-03T00:00:00Z
ImplCommit: 73af07e2
ImplRuntime: claude
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [Q-tui-lib, Q-distribution, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: [https://github.com/nicholasgasior/opentui]
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

TUI foundation: `src/tui/index.ts` entrypoint (`fulcrum tui` dispatcher from Pillar 14 binary), in-process tRPC caller bootstrap (`createCaller(ctx)` from Better-Auth session file), TUI router (`src/tui/router.ts`) with 5-deep history stack + `GoBack` pop, FakeTTY driver (`src/tui/testing/fake-tty.ts`) for stdin injection + stdout capture + ANSI strip, subscription EventEmitter bridge (wraps tRPC subscription types; subscribe/unsubscribe lifecycle), error boundary + crashlog (unhandled render error → fallback screen + `errors/YYYY-MM-DD.jsonl`), local telemetry hooks (`local_telemetry` row per screen render via `perf.now()`). Failure gate: if OpenTUI missing key primitives, switch to ratatui (Rust) — gated by `T15-75` snapshot gate.

- **Web**: not applicable — foundation is TUI-only.
- **CLI**: `fulcrum tui` binary entrypoint (scaffolded in Pillar 14) calls `src/tui/index.ts`.
- **TUI**: primary surface — this slice IS the foundation all other TUI slices build on.

## Acceptance criteria

- [ ] `fulcrum tui` binary smoke: launches, renders root screen, exits cleanly on `q` / `Ctrl+C`.
- [ ] `tasks.list` via `createCaller(ctx)` returns typed data; FORBIDDEN on bad session.
- [ ] TUI router: `navigate('/projects')` renders Projects screen; `GoBack` returns to previous; unknown route → fallback screen.
- [ ] FakeTTY: inject keypress `c` → triggers `CreateItem` action in relevant context; ANSI-stripped stdout snapshot matches.
- [ ] Subscription bridge: EventEmitter emit → screen callback called within 200ms; unsubscribe stops callbacks; 1000 subscribe/unsubscribe cycles → no memory leak.
- [ ] Error boundary: throw in screen component → fallback "TUI error" screen renders; error written to `errors/*.jsonl`.
- [ ] Telemetry: `local_telemetry` row inserted per screen render with `screen_key` + `render_ms`.

## Blocked by

None - can start immediately (requires Pillar 13 AppRouter + Pillar 14 keybindings schema)

## Notes

T15-01–T15-09 maps to this slice.
