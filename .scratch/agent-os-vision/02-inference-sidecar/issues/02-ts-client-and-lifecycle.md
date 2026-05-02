---
Status: implemented
Triage: AFK
Owner: codex-orchestrator
Pillar: 02-inference-sidecar
Blocked-by: 01-cargo-workspace-scaffold
---

# TS client + auto-spawn lifecycle + `fulcrum inference start|status|stop`

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Wire the TypeScript side of the IPC channel: `src/inference/protocol.ts` mirrors the Rust protocol types; `src/inference/lifecycle.ts` implements auto-spawn-and-supervise (`ensureRunning()` → `Bun.spawn`, PID file, 100 ms backoff readiness probe max 10 s, `stop()` sends SIGTERM + removes socket); `src/inference/client.ts` exposes `@Injectable() InferenceClient` with `call(method, params)` that opens the Unix socket, sends a length-prefixed JSON-RPC request, awaits the response with 5 s timeout, and retries 3× with exponential backoff. Wire `fulcrum inference start|status|stop` CLI verbs to `lifecycle.ts`. All three surfaces confirm the process round-trips a `health` call.

## Acceptance criteria
- [x] Rust impl / TS wrapper: `src/inference/protocol.ts` exports `InferenceRequest`, `InferenceResponse`, `HealthResult`, `InferenceError { code, backend, message }` types; Zod schemas for runtime validation.
- [x] TS wrapper: `src/inference/lifecycle.ts` — `ensureRunning()` resolves to `{ pid, socketPath }`; second call within 1 s returns cached PID without re-spawning; `stop()` kills process and removes socket + PID file.
- [x] TS wrapper: `src/inference/client.ts` — `@Injectable() InferenceClient.call('health', {})` returns typed `HealthResult`; retries 3× with backoff on socket ECONNREFUSED; throws typed `InferenceError` after exhausting retries.
- [x] CLI command: `fulcrum inference start` prints PID + socket path; `fulcrum inference status --json` returns `{"status":"ok",...}`; `fulcrum inference stop` terminates process and confirms socket removed.
- [x] TUI screen: N/A at this slice (TUI inference screen is slice 13).
- [x] Web/API surface: N/A at this slice; tRPC procedures wired in slice 04.
- [x] Tests: unit tests for `lifecycle.ts` use a mock binary; contract test spawns real `inference-server` binary (built in CI), sends `health` over socket, asserts typed response; `bun test src/inference/__tests__/lifecycle.test.ts` green.

## Blocked by
01-cargo-workspace-scaffold

## Notes
- `Bun.spawn` is preferred; fallback to `node:child_process` spawn with `detached: true` if Bun supervision proves unreliable.
- Socket path: `$FULCRUM_HOME/inference.sock`; PID file: `$FULCRUM_HOME/inference.pid`.
- Windows: detect `process.platform === 'win32'`, use stdio JSON-RPC transport in `client.ts` instead of socket.
- `InferenceClient` is resolved from the needle-di container for ALL callers — no caller touches `lifecycle.ts` directly.
- Completed with TS length-prefixed socket client + lifecycle supervisor, `fulcrum inference start|status|stop`, and Rust socket support for both length-prefixed TS frames and existing newline smoke frames.
- Verification: `bun test --conditions=svelte ./src/inference/protocol.test.ts ./src/inference/client.test.ts ./src/inference/lifecycle.test.ts ./src/inference/contract.test.ts ./src/cli/inference.test.ts`; `bun test --conditions=svelte ./tests/cli/entrypoint.test.ts`; `cargo test --manifest-path inference/Cargo.toml -p inference-server`; `bash inference/scripts/smoke.sh inference/target/debug/inference-server`; `bun run --bun tsc --noEmit`; `semgrep --config auto --json src/inference src/cli/inference.ts inference/inference-server/src/main.rs`.
