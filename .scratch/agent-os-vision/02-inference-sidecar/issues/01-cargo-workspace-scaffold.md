---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: None
---

# Cargo workspace scaffold + JSON-RPC server skeleton + smoke test

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Bootstrap the `inference/` Cargo workspace with four crates (`inference-core`, `inference-server`, `inference-embed`, `inference-generate`), wire a minimal JSON-RPC 2.0 dispatcher that accepts a `health` request over Unix domain socket (with stdio fallback), and return `{"status":"ok","backends":[],"models":[]}`. The binary must build as a single static artifact targeting stable Rust edition 2021. Smoke test: `./inference-server --version` exits 0; `health` JSON-RPC returns the expected shape.

## Acceptance criteria
- [ ] Rust impl: `inference/Cargo.toml` workspace declares `inference-core`, `inference-server`, `inference-embed`, `inference-generate`; `cargo build --release` succeeds on ARM64 macOS and x86_64 Linux CI.
- [ ] Rust impl: `inference-core/src/protocol.rs` defines `Request`, `Response`, `Error`, `HealthResult` serde types matching the JSON-RPC 2.0 spec; `cargo test -p inference-core` green.
- [ ] Rust impl: `inference-server` binary: listens on `$FULCRUM_HOME/inference.sock` (Unix socket, length-prefix newline-delimited JSON); falls back to stdio when socket unavailable; dispatches `health` method; unknown methods return JSON-RPC error `-32601`.
- [ ] CLI command: `./inference-server --version` exits 0 and prints semver; `echo '{"jsonrpc":"2.0","id":1,"method":"health","params":{}}' | ./inference-server` returns valid `HealthResult` JSON via stdio transport.
- [ ] TUI screen: N/A at this slice (no TS client yet); covered in slice 02.
- [ ] Web/API surface: N/A at this slice; covered in slice 04.
- [ ] Tests: `cargo test --workspace` passes; a shell smoke-test script in `inference/scripts/smoke.sh` runs the server in background, sends a health request via `nc` or `socat`, asserts `"status":"ok"`, exits.

## Blocked by
None

## Notes
- Use `tokio` async runtime; `serde_json` for serialization; `tokio::net::UnixListener` for socket.
- `inference-embed` and `inference-generate` are empty crates at this stage — just `lib.rs` stubs.
- Binary must not dynamically link anything beyond system libc; verify with `otool -L` (macOS) / `ldd` (Linux) in CI.
- Keep `inference/Cargo.lock` checked in (binary crate convention).
