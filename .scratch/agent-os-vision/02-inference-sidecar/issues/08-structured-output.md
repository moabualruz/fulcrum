---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 07-generate-operation
---

# Structured output — grammar-constrained generation via JSON Schema

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Add grammar-constrained decoding to `generate()`: Rust `inference/inference-generate/src/grammar.rs` converts a JSON Schema subset to GBNF grammar; logit-bias mask applied to the `candle` sampler so only tokens consistent with the grammar are sampled; `GenerateOptions.schema` field activates this path. Wire through CLI `--schema <json>`, tRPC, and a web settings debug panel that accepts a schema and renders the validated JSON output.

## Acceptance criteria
- [ ] Rust impl: `grammar.rs` converts `{ "type": "object", "properties": { "agent": { "type": "string" } }, "required": ["agent"] }` to a valid GBNF grammar; logit-bias applied during sampling; output `serde_json::from_str` validates against the schema; on validation failure, retries up to 3×; `cargo test -p inference-generate -- grammar` green with the above schema.
- [ ] CLI command: `fulcrum inference generate "route this task" --schema '{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}' --json` returns `{ "agent": "<value>" }` valid JSON matching schema.
- [ ] TUI screen: N/A at this slice; structured output used by router-llm slice (separate pillar).
- [ ] Web/API surface: `/settings/inference` "Test generate" panel adds optional "JSON Schema" textarea; when filled, calls `inference.generate(prompt, { schema })` via tRPC; renders parsed JSON with a validity indicator.
- [ ] Tests: contract test with schema → assert output parses as JSON and satisfies schema; test with invalid schema → `InferenceError` with code `GRAMMAR_ERROR`; Playwright test fills schema + prompt, asserts valid JSON rendered. `bun run ci` green.

## Blocked by
07-generate-operation

## Notes
- GBNF grammar subset needed: `object`, `array`, `string`, `number`, `boolean`, `null`, `required`, `additionalProperties: false`.
- Failure gate: grammar generation fails for complex schemas (nested `$ref`, `oneOf`, `anyOf`) → post-hoc validation path: generate free text → `serde_json::from_str` → retry 3×; surface `GRAMMAR_FALLBACK` warning in response.
- Do not cache schema-constrained responses (avoid false cache hits where same prompt + different schema returns stale output from gen_cache).
