---
Status: integration-review
Owner: codex-orchestrator
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 02-ts-client-and-lifecycle
---

# tRPC `inference.*` procedures + `health()` three-surface parity

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Wire all tRPC inference procedures in `src/server/trpc/routers/inference.ts` (resolving `InferenceClient` from needle-di): `health()`, `embed()`, `generate()`, `classify()`, `tokenize()`, `models.list()`, `models.pull()` (subscription), `models.rm()`, `backends.list()`. Then prove three-surface parity for `health()`: the same `HealthResult` data is returned from (1) the web settings page server load, (2) `fulcrum inference status --json` CLI, and (3) the TUI inference screen badge — all three call through `InferenceClient`.

## Acceptance criteria
- [ ] Rust impl / TS wrapper: `src/server/trpc/routers/inference.ts` exports all nine procedures above; each resolves `InferenceClient`; TypeScript types align with `protocol.ts`; `inference.backends.list()` returns flag-gated availability using `isEnabled()`.
- [ ] CLI command: `fulcrum inference status --json` output matches `HealthResult` type; `fulcrum inference embed "hello" --json` returns `{ vectors, model, cached }`; `fulcrum inference generate "..." --json` returns `{ text, model, tokens }` — all backed by tRPC procedures via CLI adapter.
- [ ] TUI screen: global nav backend badge (green/yellow/red) renders based on `inference.health` tRPC query polled every 30 s; no crash on server down (shows red badge).
- [ ] Web/API surface: `src/web/src/routes/settings/inference/+page.server.ts` calls `inference.health` and `inference.models.list`; page renders backend status + model list without error.
- [ ] Tests: unit tests assert `inference.health()` tRPC procedure returns typed `HealthResult`; `inference.embed(["test"])` returns `number[][]`; `inference.models.pull` subscription emits progress events; all mock `client.ts` at the boundary. `bun test src/server/trpc/routers/__tests__/inference.test.ts` green.

## Blocked by
02-ts-client-and-lifecycle

## Notes
- `inference.models.pull` uses tRPC `observable` subscription, streaming `{ pct, downloaded, total }`.
- `backends.list()` reads `FULCRUM_INFERENCE_BACKEND` env + `isEnabled()` for `embeddings`, `router-llm`, `external-llm-provider` flags.
- Three-surface parity is the PRD's explicit acceptance criterion — verified here by a contract test that calls all three paths and asserts identical `status` field.
