---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 10-ts-backend-abstraction
---

# Per-feature backend routing config — web settings + CLI + tRPC

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Expose full read/write control over the per-feature backend routing map (`router-llm:embedded`, `embeddings:ollama`, `embeddings:lm-studio`, etc.) across all three surfaces. The routing map is persisted in the `feature_flags` config store from Pillar 1 (or a MikroORM `InferenceRouting` entity if Pillar 1 uses a simpler schema). The web settings page lets the user pick a backend per feature from a dropdown (gated backends greyed out unless their flag is on). CLI `fulcrum inference config set <feature>:<backend>` and `fulcrum inference config list --json`. tRPC `inference.config.get()` / `inference.config.set()`.

## Acceptance criteria
- [ ] Rust impl / TS wrapper: routing map type `FeatureBackendMap` in `protocol.ts`; `InferenceClient` reads it at call time (not startup) so config changes take effect without restart; `src/inference/client.ts` `selectBackend(feature)` correctly resolves qualifier chain: explicit map entry → global `FULCRUM_INFERENCE_BACKEND` env → `embedded`.
- [ ] CLI command: `fulcrum inference config list --json` returns current routing map; `fulcrum inference config set embeddings ollama` updates map; `fulcrum inference config set embeddings embedded` resets; all write through tRPC.
- [ ] TUI screen: Settings → Inference screen (slice 13) includes per-feature backend rows with dropdown; changing dropdown calls `inference.config.set()` tRPC mutation; updates reflected immediately.
- [ ] Web/API surface: `/settings/inference` per-feature backend selector dropdowns; disabled options for gated backends with "Enable flag X first" tooltip; save triggers `inference.config.set()`; success toast; page re-fetches health to confirm routing change.
- [ ] Tests: unit test `selectBackend('embeddings')` with various map states; integration test sets config via tRPC, makes embed call, asserts Ollama mock was hit; Playwright test changes embedding backend to "ollama" and back. `bun run ci` green.

## Blocked by
10-ts-backend-abstraction

## Notes
- Routing map persisted via `isEnabled` / config store from Pillar 1 — no new entity needed if Pillar 1's feature flag store supports value payloads. Otherwise add MikroORM `InferenceRouting` entity or `appConfig.inferenceRouting` JSON property.
- Default map (shipped, no env override needed): `{ embeddings: 'embedded', 'router-llm': 'embedded', 'memory-llm-extract': 'embedded' }`.
- Config change does NOT require sidecar restart — `InferenceClient` reads map per-call.
