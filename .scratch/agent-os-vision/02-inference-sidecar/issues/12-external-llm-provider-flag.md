---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 10-ts-backend-abstraction
---

# `external-llm-provider` flag — URL + API key wire-up gated

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Complete the `OpenAICompatibleBackend` gating: when `isEnabled('external-llm-provider')` is true, `FULCRUM_INFERENCE_URL` + `FULCRUM_INFERENCE_API_KEY` configure the backend; it covers Anthropic, OpenAI, Groq, Together, DeepSeek, Vercel, OpenRouter — any OpenAI-compat endpoint. Web settings page has an "External LLM Provider" section (hidden behind the flag) for URL + key input with a "Test connection" button. CLI `fulcrum inference config set-provider --url <url> --key <key>`. tRPC `inference.provider.test()` procedure.

## Acceptance criteria
- [ ] TS wrapper: `OpenAICompatibleBackend` — when flag off, `health()` returns `{ available: false, reason: 'flag external-llm-provider disabled' }`; when flag on, reads `FULCRUM_INFERENCE_URL` + `FULCRUM_INFERENCE_API_KEY`, makes `/v1/models` probe call, returns healthy/unhealthy; no vendor SDK added.
- [ ] CLI command: `fulcrum inference config set-provider --url https://api.openai.com/v1 --key sk-... ` writes URL + key to config store; `fulcrum inference status --json` reflects `external-llm-provider` backend when flag on; `fulcrum inference config test-provider --json` returns `{ ok: true, latency_ms: N }` or error.
- [ ] TUI screen: Settings → Inference screen shows "External LLM Provider" section when flag enabled; URL + key fields; "Test" button; connection status indicator.
- [ ] Web/API surface: `/settings/inference` — "External LLM Provider" card visible only when `isEnabled('external-llm-provider')`; URL + API key inputs; "Test Connection" button calls `inference.provider.test()` tRPC; shows latency or error message.
- [ ] Tests: unit test with flag off → `available: false`; unit test with flag on + mocked HTTP → `available: true`; Playwright test: enable flag, fill URL + key, click Test, assert success indicator. `bun run ci` green.

## Blocked by
10-ts-backend-abstraction

## Notes
- API key stored in config store, not in `FULCRUM_INFERENCE_API_KEY` env permanently — env is the override path; config store is the persisted path.
- `/v1/models` probe: `GET $FULCRUM_INFERENCE_URL/models` with `Authorization: Bearer $key`; 200 → healthy; non-200 or network error → unhealthy with message.
- No Anthropic SDK or OpenAI npm package. Raw `fetch` only.
- Flag default: OFF. User explicitly enables via `fulcrum features enable external-llm-provider`.
