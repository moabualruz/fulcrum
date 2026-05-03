---
Status: implemented
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 11-dispatch-loop-happy-path
---

# OTel spans on every state transition + no-op when exporter unset

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Wire `@opentelemetry/api` + `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` into `src/orchestration/symphony/telemetry.ts`:
- `initTracer(serviceName)` — configures SDK with OTLP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; falls back to no-op TracerProvider when unset. Zero overhead in local-first mode.
- `traceTransition(tracer, from, to, attrs)` — `tracer.startActiveSpan('symphony.state_transition')` with attributes `{from_state, to_state, org_id, run_id, attempt_count}`.
- CI gate: `bun pm ls @opentelemetry/api` must show exactly one version (peer dep conflict guard per PRD failure gates).

## Acceptance criteria
- [ ] Schema / state machine: N/A
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: every state transition in `orchestrator.ts` wrapped in `traceTransition`; no-op when exporter unset (local default)
- [ ] Surfaces (web/cli/tui parity): N/A (infra); telemetry sink configurable via env; no UI surface needed
- [ ] Tests: test tracer (in-memory span exporter) captures spans with correct `from_state`/`to_state` attributes; span count matches transition count; with unset exporter env, zero spans exported and no errors thrown
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Telemetry section mapped to `telemetry.ts`

## Blocked by
11-dispatch-loop-happy-path

## Notes
Apache-2.0 packages. `pino` structured logs remain as always-on companion; OTel spans are additive. CI `bun pm ls` check is a fast assertion, not a long test.
