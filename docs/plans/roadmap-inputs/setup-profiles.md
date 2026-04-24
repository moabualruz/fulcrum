# Setup Profiles Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/guides/setup-profiles.md

## Must Carry Into Roadmap
- Setup CLI must support `setup plan`, `setup install`, `setup doctor`, `setup provider configure`, and dry-run-style `setup uninstall`; non-dry-run uninstall with `--purge-backups` must require confirmation.
- Profiles: `core`, `code`, `memory`, `actions`, `full`; Fulcrum should install safe reversible managed assets and guide host/provider-specific dependencies.
- Doctor is readiness authority. It must classify each dependency as `managed`, `detected`, `guided`, `optional`, or `blocked`, verify receipts, host tools, provider config, and smoke tests, and print exact fixes.
- Install must create receipts for managed assets: `$FULCRUM_HOME` dirs/config/DB/logs/backups/manifests; parser/index/LanceDB/Zoekt assets; LightRAG uv project and memory dirs; optional Windmill/Plane compose/env files.
- Memory provider contract must remain generic OpenAI-compatible shape: kind, base URL, API key env, chat model, embedding model, embedding dimensions.
- Provider presets to include: `ollama-local`, `lmstudio-local`, `vllm-local`, `llama-cpp-local`, `localai`, `openai-compatible`; Ollama is preset only, not required.
- Model defaults: normal local uses `Qwen3-Embedding-0.6B`, `Qwen3-Reranker-0.6B` or `BAAI/bge-reranker-v2-m3`, `Qwen3-14B` with `Qwen3-8B` fallback; low-resource fallback uses `embeddinggemma` or `all-minilm` plus `Qwen3-8B`.
- High-quality local and remote opt-in profiles should preserve documented choices, including Qwen3 larger embedding/reranker/chat models, Codestral Embed, voyage-code-3, Gemini/OpenAI embeddings, Cohere rerank, and GPT-5/GPT-5.5.
- Cross-OS strategy required for every dependency install, health, and uninstall step: Linux/macOS `$FULCRUM_HOME`, Windows `%FULCRUM_HOME%`, native binaries or `.exe` as appropriate.
- Agent UX must support `--json`, stop on `blocked`, and never guess missing memory provider choices.

## Milestone Impacts
- M1/Core setup: implement `fulcrum init`, `setup plan core`, `setup install core`, `setup doctor core`, receipts, `$FULCRUM_HOME` layout, backups preservation, JSON output.
- M2/Code indexing setup: add `code` profile with Tree-sitter parser bundle, code index dirs, LanceDB local store smoke test, Zoekt managed bundle/wrapper or detected/guided fallback.
- M3/Memory setup: add provider configure flow, LightRAG uv sidecar under `$FULCRUM_HOME/sidecars/lightrag`, provider env generation, embedding dimension validation, vector rebuild blocking on model/dimension changes.
- M4/Actions setup: add optional Docker detection and guided Windmill compose/env generation; keep workflows human-triggered and Fulcrum-owned for agent lifecycle/live run state.
- M5/Full profile: compose `code` + `memory` + `actions`, plus optional Plane Docker-backed sidecar; warnings for optional sidecars must not fail static certification.
- Docs milestone: preserve human quick path and agent quick path, plus exact remediation text for guided/blocked states.

## Acceptance Criteria
- `fulcrum setup plan <profile>` reports static gates: host-targeted-plan, required-dependencies-planned, health-checks-planned, cross-os-strategy, optional-sidecars.
- Static certification fails only for missing required steps or missing cross-OS coverage; optional sidecars produce warnings.
- `fulcrum setup install <profile>` creates managed assets and receipts only for selected profile assets; no forced install of host package managers, Docker Desktop, or model/provider products.
- `fulcrum setup doctor <profile>` validates receipts, host binaries/tools, configured providers, embedding vector length against configured dimensions, and smoke tests.
- Doctor blocks requested profile when required runtime/provider is missing; doctor guides with exact install/config steps when Fulcrum should not install dependency.
- `setup provider configure` writes provider config for LLM endpoint plus embedding endpoint, model names, and embedding dimensions.
- JSON mode returns machine-readable dependency states and missing provider fields so agents can stop on `blocked`.
- Uninstall preview preserves `$FULCRUM_HOME/backups` by default; backup purge remains explicit and confirmation-gated.

## Risks / Open Questions
- Need concrete receipt schema, versioning, and migration behavior for managed assets.
- Need decision on whether Zoekt managed bundle is always shipped per OS/arch or sometimes guide-only.
- Need exact LightRAG uv lock strategy, Python/uv minimum versions, and sidecar update policy.
- Need provider smoke-test contract across OpenAI-compatible servers, especially embedding dimension discovery and error normalization.
- Need vector rebuild UX after embedding model or dimensions change.
- Need Docker confirmation flow details for Windmill/Plane and Windows/macOS Docker Desktop guidance.
- Need explicit non-dry-run uninstall executor scope and safety confirmations.
- Need source of truth for remote model availability and cost/privacy warnings.

## Links To Preserve
- Commands: `fulcrum setup plan/install/doctor <profile>`, `fulcrum setup provider configure`, `fulcrum setup uninstall full --purge-backups`.
- Profiles: `core`, `code`, `memory`, `actions`, `full`.
- Setup states: `managed`, `detected`, `guided`, `optional`, `blocked`.
- Managed paths: `$FULCRUM_HOME`, `$FULCRUM_HOME/backups`, `$FULCRUM_HOME/sidecars/lightrag`, `%FULCRUM_HOME%\...`.
- Sidecars/tools: Tree-sitter, Zoekt, LanceDB, LightRAG, uv/Python, Docker, Windmill, Plane.
- Quick paths: human setup path through `init`, `install`, `doctor`; agent JSON path with stop-on-blocked behavior.
