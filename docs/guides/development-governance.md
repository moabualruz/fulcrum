# Development Governance And Engineering Guidelines

Status: active guidance for subsequent Fulcrum development.
Last updated: 2026-04-22.

## Source Base

These rules synthesize the local Fulcrum architecture with current external guidance:

- NIST SSDF SP 800-218: secure software development practices: https://csrc.nist.gov/pubs/sp/800/218/final
- DORA software delivery capabilities: https://dora.dev/devops-capabilities/
- Model Context Protocol specification security considerations: https://modelcontextprotocol.io/specification/2024-11-05
- ONNX Runtime install and CUDA execution provider guidance: https://onnxruntime.ai/docs/install and https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- Ollama embed API, for explicit optional provider configuration only: https://docs.ollama.com/api/embed

## Governing Principles

1. Local-first control plane.
   Fulcrum owns state, memory, policy, worktrees, events, and integration artifacts locally. Network calls are explicit provider choices, never hidden defaults.

2. Embedded models first for default memory.
   Default embeddings and reranking run through embedded local models. The runtime must try supported GPU execution providers before CPU. CPU is a fallback only after a recorded GPU initialization failure, not a silent default.

3. Provider choice stays explicit.
   `local`, `ollama`, `openai`, `voyage`, and future providers are configuration choices. One provider must not silently become another provider. Failover inside `local` may move across local execution backends (`cuda`, `webgpu`, CPU/WASM) with visible diagnostics.

4. Spec before change.
   Significant features need a spec, task breakdown, and acceptance checks before implementation. Spec Kit artifacts are project-local and must stay in sync across installed agents.

5. Capability boundaries over role strings.
   Role behavior must use exported capability helpers. Never compare role slug strings in production code.

6. Policy before side effects.
   Any path that starts an agent run, invokes a team, merges worktrees, writes files, or pushes externally must pass policy first. Policy denials return structured reasons.

7. Memory integrity before recall quality.
   L0 writes are canonical. L1 and L2 derive from L0. Importers must preserve source, session id, project root, event time, and deterministic IDs.

8. Agent-native parity.
   Any human-visible workflow should have a CLI/MCP/action path with structured input, JSON output when useful, and clear errors.

9. Secure by default.
   Follow SSDF: validate inputs, protect secrets, minimize privileges, log security-relevant denials, and keep install/update paths auditable.

10. Observable failures.
    A degraded path must say what degraded, why, and what to do next. Silent fallback is acceptable only for explicitly best-effort optional telemetry.

## Development Rules

- Use repo-local `./fulcrum` for scripts that mutate Fulcrum state. Avoid stale globally installed CLIs.
- When importing sessions, include `source_agent`, `session_id`, `project_root`, `event_time`, and `agent:<source>` tags.
- When embedding, support `--limit` and `--batch-size` so operators can smoke test before large backfills.
- Keep batch defaults conservative. Increase only after a CUDA smoke run proves memory headroom.
- Do not call `fulcrum memory embed` for all rows in an interactive task when estimated runtime is hours. Run a bounded smoke test, report throughput, then use a scheduled or supervised backfill.
- Do not treat Ollama as automatic failover. It is a first-class explicit provider when configured.
- For ONNX CUDA on Linux, CUDA and cuDNN library directories must be visible before Node starts through `LD_LIBRARY_PATH` or the dynamic linker.
- Add tests for provider registry behavior and request contracts. Do not rely on live network/model calls in default tests.
- Every CLI-agent integration must install project-local artifacts and verify them with a command that can be rerun safely.
- If a CLI agent has no discoverable transcript store, document that as a checked absence rather than claiming support.

## Local Model Runtime Policy

Default config:

```json
{
  "embedding": {
    "text": {
      "provider": "local",
      "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024,
      "device": "auto"
    },
    "code": null
  },
  "reranker": {
    "provider": "local",
    "model": "onnx-community/bge-reranker-v2-m3-ONNX",
    "device": "auto"
  }
}
```

`device: "auto"` means:

1. Try CUDA.
2. Try WebGPU if available.
3. Fall back to CPU/WASM with a diagnostic.

If the user configures `device: "cuda"` for embeddings or reranking, CUDA failure is fatal. This is the correct mode for verifying a GPU setup.

Optional provider example:

```json
{
  "embedding": {
    "text": {
      "provider": "ollama",
      "model": "qwen3-embedding:4b",
      "dimensions": 1024,
      "baseUrl": "http://127.0.0.1:11434"
    },
    "code": null
  }
}
```

This is a deliberate operator choice, not fallback from `local`.

## CLI Agent History Coverage

Current importer support:

- Claude Code: `~/.claude/projects/<project>/*.jsonl`
- Codex: `~/.codex/sessions/**/*.jsonl`
- Gemini CLI: `~/.gemini/tmp/<project_hash>/chats/*.json`
- Pi Coding Agent: `~/.pi/agent/sessions/**/*.jsonl`
- Qwen Code: `~/.qwen/tmp/<session>/logs.json`
- opencode: `opencode.db` via `opencode db`

Checked absence:

- GitHub Copilot CLI: `gh copilot` is available, but no local transcript store was found on this machine.

## Acceptance Checks

Before calling a change done:

- Focused tests pass for changed packages.
- `pnpm build` or package build passes where generated dist is used by local scripts.
- `./fulcrum memory embed --limit 2 --batch-size 2` succeeds after embedding-runtime changes.
- Session importer dry-run shows source breakdown before writing.
- Install checks verify actual files/extension registry, not only command availability.
