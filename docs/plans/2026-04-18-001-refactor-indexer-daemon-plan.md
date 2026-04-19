---
title: "refactor: fulcrum-indexer daemon — replace lock-file + per-process PCI watcher"
type: refactor
status: active
date: 2026-04-18
origin: (no brainstorm doc — authored from live debugging session + Watchman architecture research)
---

# Fulcrum Indexer Daemon

> **For agentic workers:** REQUIRED SUB-SKILL: Use `agent-skills:incremental-implementation` + `agent-skills:test-driven-development` to implement this plan PR-by-PR.

**Goal:** Replace `packages/memory/src/pci/{lock.ts,singleton.ts}` (file-lock + per-process chokidar) with a single long-lived **fulcrum-indexer daemon** per user that hosts every project's chokidar watcher and serves clients (CLI, `fulcrum serve mcp`, `fulcrum serve monitor`, hook invocations) over a platform-appropriate IPC socket. The socket binding IS the lock — kernel-managed, auto-released on process death, zero stale-cleanup logic, zero TTL heuristics, zero pid-reuse risk, portable to Windows named pipes via the same node `net` API. Architecture modeled on Facebook Watchman (Meta's canonical file-watcher service, 2013+), whose `get-sockname` + `watch-project` shape we match directly.

**Why this lands:** The current file-lock design has repeatedly failed in practice during the 2026-04-17 debugging session — stale locks after crashed MCP processes, pid-reuse risk patched only by a `process.kill(pid, 0)` band-aid, race between two `fulcrum serve mcp` processes each calling `acquireServerHandle(cwd)`, and no defined behavior on NFS / CIFS / overlayfs where file-creation atomicity is not guaranteed. The daemon model eliminates every one of those failure classes by construction, not by patching.

**Tech Stack:** TypeScript ESM, node `net` module (no new runtime deps), `better-sqlite3` (existing), `chokidar` (existing, re-homed into daemon), `fulcrum-agent-core` primitives (`globalDataDir`, `projectIdsFromPath`), vitest (pool: forks).

**Non-goal (deferred):** Remote indexing, TCP endpoints, cross-user daemons, authentication on the socket. The daemon binds a socket whose file permissions are 0600 on POSIX and whose named-pipe ACL is user-scoped on Windows — that is the full trust model. v2 if we ever need it.

---

## Architecture Decisions

- **One daemon per user (not per project).** All projects share one node process hosting a `Map<realpath, ChokidarInstance>`. This matches Watchman exactly and eliminates the cross-process coordination problem entirely — there are no "two processes both trying to watch the same project" scenarios because there is only ever one daemon. Multiple concurrent `fulcrum` CLI invocations, multiple MCP servers, multiple hook executions all talk to the same one.

- **Socket bind = the lock.** The daemon calls `net.createServer().listen(socketPath)`. If the path is already bound, `listen` emits `EADDRINUSE` — that is a reliable, synchronous, kernel-sourced "someone else is running". No TTL, no pid file, no staleness check. When the daemon process dies (signal, OOM, crash), the kernel releases the socket. Exactly what a lock should do.

- **Cross-platform via one platform branch:** `process.platform === 'win32' ? \\\\.\\pipe\\fulcrum-indexer-${user}` : `${globalDataDir()}/fulcrum-indexer.sock`. Node's `net` module handles both identically through the same `listen(path)` / `connect(path)` API. The daemon does NOT use filesystem permissions as its security boundary on Windows; named pipes inherit per-user ACLs.

- **Discovery via `fulcrum daemon sockname`:** a tiny CLI subcommand that prints the resolved socket path. Mirrors `watchman get-sockname`. Agents / scripts / future debugging tools consume this. Also doubles as the auto-spawn trigger if called with `--ensure` (resolves path AND spawns daemon if not running).

- **Auto-spawn on first connect.** Every client attempt goes through a shared helper:
  1. `net.connect(socketPath)` →
     - resolves → client is connected, done
     - `ENOENT` / `ECONNREFUSED` → daemon is not running → **spawn** via `child_process.spawn('fulcrum', ['daemon', 'indexer'], { detached: true, stdio: 'ignore' })`; `ref.unref()`; wait with exponential backoff (up to ~2 s) for the socket to appear; retry connect.
  2. Two clients racing to spawn is fine: one wins the `listen()` bind, the other gets `EADDRINUSE`, exits quickly, and the losing client's next connect succeeds against the winner.

- **Wire protocol: newline-delimited JSON** (NDJSON). Each message is a single JSON object terminated by `\n`. Request/response correlation via a monotonic `id` field. Keeps parsing trivial (stream + split on `\n`), keeps debugging possible with `nc -U <socket>`. No protobuf, no BSER, no length-prefix framing. Matches the daemon's scale: hundreds of requests/sec at peak, not millions.

- **Chokidar stays in the daemon.** The daemon owns `Map<realpath, { watcher, refcount, clients }>`. Adding or releasing a watch is a refcount operation; chokidar is only torn down when refcount reaches 0 AND after a 30 s grace period (same policy as the current singleton — prevents thrash when one session ends and another in the same project starts immediately).

- **Watch consolidation (`watch-project` semantics).** A client asking to watch `/a/b/c` when the daemon already watches `/a/b` returns `{ watch: '/a/b', relative_path: 'c', already_watched: true }`. The client stores `watch` + `relative_path` and all subsequent queries are scoped via those two fields. The daemon never mounts two overlapping subtrees.

- **Idle timeout (default 30 min, env-tunable).** If the daemon has zero active watches and zero in-flight requests for N minutes, it self-exits. The next client invocation re-spawns it. This matches Watchman's behavior and keeps the daemon from hoarding inotify fds indefinitely on machines that rarely re-open the project.

- **Writes still go to the central SQLite at `globalDataDir()/fulcrum.db`.** The daemon opens the DB once at startup in WAL mode (already the project default) and runs the existing `ingestFile` / `ingestProject` writers. No new SQLite file, no per-project DBs, no replication. Hook-driven `ingestFile` calls from short-lived CLI invocations continue to write directly to the same central DB — they don't need to go through the daemon because a single `INSERT OR IGNORE` via WAL concurrency is cheaper than a round-trip. The daemon's role is to own the **chokidar subscription**, not to serialize writes.

- **Delete `packages/memory/src/pci/{lock.ts,singleton.ts}` entirely.** Not deprecated — deleted. The new daemon/client code replaces them. `lifecycle.ts` is rewritten in terms of the client. The existing `syncer.ts`, `watcher.ts`, `walker-integration.ts`, `git-files.ts`, `ignore-patterns.ts`, `hash.ts`, `detect-fs.ts` are kept — they are the watch-side primitives the daemon consumes, not the broken coordination layer.

- **No daemon state on disk.** The daemon's refcount map is in-process memory only. If the daemon restarts, clients re-ensureWatching on their next operation. This is fine because ensureWatching is idempotent.

---

## Critical Constraints (preserve verbatim; carry forward from memory v2a)

1. **Global-only data** (HARD). Daemon socket, logs, any ephemeral state live under `globalDataDir()` only. Nothing under any project directory. `.fulcrum/` in a project dir is forbidden.
2. **CLI-first primary; MCP overlay.** Every capability reachable via `fulcrum action exec <name>` OR a direct CLI invocation. MCP continues to work but must not become a prerequisite. Disabling MCP entirely leaves the daemon + hooks path intact.
3. **Hook-driven writes stay in the hook process.** `PostToolUse` on `Write/Edit/MultiEdit/NotebookEdit` continues to call `ingestFile` directly (no daemon round-trip), because the hook is synchronous to the agent's tool call and must not introduce IPC latency to the tool-call critical path.
4. **Control-plane features are dormant, not absent.** The daemon code ships, but nothing auto-starts it except (a) an explicit CLI client connect or (b) `fulcrum daemon indexer` run directly. No shell rc, no systemd unit, no launchctl plist in the default installer.
5. **Sanitize-before-WAL invariant.** Any write path the daemon enables must still run through the existing `sanitizeOnWrite()` → WAL record → L0 → L1 → L2 ordering. The daemon is a coordination layer, not a new write pipeline.
6. **Loopback-only.** On POSIX, socket path permissions are 0600 and located under `globalDataDir()` (user-owned). On Windows, named pipe security is user-scoped via default DACL. No TCP, ever.

---

## File Structure

```
packages/memory/
  package.json                              — no new deps; chokidar stays
  src/
    index.ts                                — MODIFIED: replace pci/* re-exports with indexer-client re-exports
    pci/
      lock.ts                               — DELETE
      singleton.ts                          — DELETE
      lifecycle.ts                          — MODIFIED: implement onAgentRunStart/End/acquireServerHandle in terms of indexer-client
      syncer.ts                             — UNCHANGED (consumed by daemon)
      watcher.ts                            — UNCHANGED (consumed by daemon)
      walker-integration.ts                 — UNCHANGED (consumed by daemon)
      git-files.ts                          — UNCHANGED
      ignore-patterns.ts                    — UNCHANGED
      hash.ts                               — UNCHANGED
      detect-fs.ts                          — UNCHANGED
    indexer/
      protocol.ts                           — NEW: request/response types, NDJSON codec, request id allocator
      socket-path.ts                        — NEW: platform-branch to resolve the socket path
      client.ts                             — NEW: indexerClient — connect-with-auto-spawn, RPC dispatcher, reconnect
      daemon.ts                             — NEW: daemon entrypoint; hosts chokidar Map<realpath, Entry>; handles requests; idle timeout
      handlers.ts                           — NEW: daemon-side handlers for ensureWatching/releaseWatching/getStatus/triggerReindex/ping
      tests/
        protocol.test.ts                    — NEW
        socket-path.test.ts                 — NEW
        client-autospawn.test.ts            — NEW
        daemon-watch-consolidation.test.ts  — NEW
        daemon-idle-timeout.test.ts         — NEW
        client-daemon-roundtrip.test.ts     — NEW (integration)
        client-daemon-crash-recovery.test.ts — NEW (integration)

packages/cli/
  src/
    index.ts                                — MODIFIED: serve mcp / serve monitor now call indexerClient.ensureWatching(cwd)
                                                           instead of acquireServerHandle; new `fulcrum daemon indexer`
                                                           and `fulcrum daemon sockname` subcommands
    hooks.ts                                — MODIFIED: PostToolUse file-change hook stays on direct ingestFile
                                                           (explicitly does NOT go through daemon to keep hook latency low)
    commands/
      daemon.ts                             — NEW: dispatch for `fulcrum daemon <subcommand>`

docs/
  plans/
    2026-04-18-001-refactor-indexer-daemon-plan.md   — THIS FILE (working-tree-only per user pref)
```

---

## Requirements Trace

- **R1.** No lock file shall persist across process death for more than the kernel's socket cleanup latency (i.e., immediately on process exit).
- **R2.** Simultaneous `fulcrum serve mcp` and `fulcrum serve monitor` in the same or different projects shall never fight each other for a watch, and the watcher for a project shall exist in exactly one process at a time.
- **R3.** All three platforms — Linux, macOS, Windows — shall run the same code path. The only platform-specific code shall be the socket-path resolution string.
- **R4.** `PostToolUse` hook latency shall not increase from the daemon refactor (hook still calls `ingestFile` directly).
- **R5.** Crashed daemon → next client connect respawns it with no manual cleanup required.
- **R6.** Crashed client → daemon refcount eventually reaches zero → watcher torn down after grace period → idle timeout fires → daemon exits cleanly.
- **R7.** Existing entry points (`onAgentRunStart`, `acquireServerHandle`, `ensureProject` back-fill of `root_realpath`, `runServeMcp`, `runServeMonitor`, hook path) continue to behave the same from the *caller's* perspective. The implementation under the hood changes; public call sites get a non-breaking rewrite.
- **R8.** The architecture is documented in `docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md` (this file) and is referenced from `packages/memory/src/indexer/daemon.ts`'s file header for future maintainers.

---

## Scope Boundaries

- **Non-goals:**
  - No remote-daemon / TCP mode. Local IPC only.
  - No per-workspace / per-agent-run daemons. One daemon per user.
  - No cross-daemon clustering. If a user runs fulcrum in two distinct OS-user accounts, those are two independent daemons by design.
  - No migration of existing `code_chunks` / `code_files` / `code_symbols` rows. Schema stays identical.
  - No change to `ingestFile` / `ingestProject` contract. The daemon is a coordinator; the writers are unchanged.
  - Socket auth: NOT in scope. File permissions on POSIX + named-pipe default ACL on Windows is the trust model.

### Deferred to separate tasks

- **Daemon observability over HTTP.** A future PR can add a `GET /daemon/status` endpoint on the monitor server that calls into `indexerClient.getStatus()` and renders a UI panel. This plan exposes `getStatus` at the RPC layer only.
- **Daemon-driven `ingestProject` batch.** A future `fulcrum daemon reindex <project>` subcommand. This plan ships `triggerReindex` at the RPC layer; a user-facing CLI wrapper is follow-up work.
- **Systemd / launchd unit files.** The daemon runs as a spawned child of the triggering process. Persistent-service wiring is explicit opt-in and belongs to a separate packaging plan.

---

## Context & Research

### Relevant code and patterns

- `packages/memory/src/pci/singleton.ts` — current refcount + lock-acquire dance; **target of deletion**. Its public surface (`ensure`, `shutdownAll`, `pciStatus`, `isWatcherOwnedHere`) is re-created on top of the indexer client.
- `packages/memory/src/pci/lock.ts` — current file-lock with pid-liveness + mtime TTL; **target of deletion**.
- `packages/memory/src/pci/lifecycle.ts` — current `onAgentRunStart` / `onAgentRunEnd` / `acquireServerHandle` / `releaseServerHandle`. Rewritten internally to call `indexerClient.ensureWatching` / `releaseWatching`. Caller signatures preserved.
- `packages/memory/src/pci/syncer.ts` — `startPciSyncer({root, workspace_id, project_id})` wraps a chokidar instance and runs the per-event ingest pipeline. **The daemon consumes this unchanged** — the daemon per-project entry owns one `PciSyncerHandle`.
- `packages/memory/src/pci/watcher.ts` — low-level `watchDirectory` + `handleFileEvent` primitives. Unchanged; daemon internals only.
- `packages/memory/src/ingest.ts` — `ingestFile(...)` and `ingestProject(...)`. Unchanged.
- `packages/core/src/db/client.ts` — `globalDataDir()`. The daemon's socket path and any daemon log file derive from this.
- `packages/cli/src/index.ts` lines 1424–1460 — current `runServeMcp` auto-start block (`acquireServerHandle(process.cwd())`). Becomes `indexerClient.ensureWatching(process.cwd())`.
- `packages/cli/src/index.ts` lines 1570–1580 — current `runServeMonitor` watcher mount. Same rewrite.
- `packages/cli/src/hooks.ts` lines 305–336 — `PostToolUse` filePatch path calling `ingestFile`. **Unchanged.**
- `packages/cli/src/tool-registry.ts` `ensureProject` — root_realpath back-fill. **Unchanged.** This continues to populate the column the daemon relies on when `onAgentRunStart` asks "what's this project's root?".

### Institutional learnings

- The 2026-04-17 debugging session (this session) documents every concrete failure mode the file lock exhibited. The commits `2649ad7` (pid-liveness patch), `cc74d73` (acquireServerHandle wiring), `fc70b23` (hook-driven ingest) are the band-aid trail — this plan removes the need for those band-aids, not extends them.
- The stored user pref `arch_global_only_data.md` (HARD): all DB/vault/sessions under `globalDataDir()`. Daemon respects.
- The user correction "CLI-first; MCP is only a compat surface for hook-less agents" — daemon honors this by never requiring MCP to be running; a client connect from a CLI hook flows the same as from `fulcrum serve mcp`.

### External references

- **Watchman architecture** (Meta, since 2013). Specifically:
  - `get-sockname` command returns the path AND auto-spawns the daemon — our `fulcrum daemon sockname --ensure` matches.
  - `watch-project` consolidates a new watch against existing watches, returning `{ watch, relative_path }` — our `ensureWatching` contract matches directly.
  - One daemon per user (typically at `<STATEDIR>/<USER>` socket path).
  - Cross-platform via socket abstraction on POSIX and named pipes on Windows.
  - Source: Facebook Watchman docs (`/facebook/watchman` on Context7) — verified 2026-04-18.

---

## Key Technical Decisions

- **NDJSON over length-prefixed framing:** trivial to parse, trivially debuggable via `nc -U <socket>`. The per-message overhead of line splitting is irrelevant at our request rate.
- **Detached child spawn with `stdio: 'ignore'`:** daemon's stdout/stderr are lost by default. A future task can wire daemon logs to `${globalDataDir()}/logs/indexer-<date>.log` if needed; today, silent is correct (matches Watchman).
- **Idle-timeout defaults to 30 min**, overridable via `FULCRUM_INDEXER_IDLE_MS`. A noisy dev flipping between projects every few minutes will pay 1 respawn per 30-min gap in activity — negligible.
- **Refcount grace period stays at 30 s** (matches the current singleton). Session ending + new session starting in the same project within 30 s reuses the watcher.
- **The daemon's SQLite handle uses the same `setDb(db)` injection the rest of the codebase uses**, so the daemon's writes and every CLI client's reads share the same connection pool characteristics as today.
- **No heartbeat protocol** between client and daemon. The TCP/socket connection itself dying is the signal — `net.Socket#on('close')` fires on the daemon side, and refcount decrements there.
- **Windows named pipe path is per-user** (`\\\\.\\pipe\\fulcrum-indexer-${os.userInfo().username}`) so two unrelated users on the same Windows box get independent daemons without interference.

---

## Open Questions

### Resolved during planning

- **Q:** Should hooks go through the daemon or keep direct `ingestFile`? **A:** Keep direct. Hooks are latency-critical to the agent's tool call; the daemon would add a round-trip. The daemon exists to coordinate long-lived chokidar subscriptions, not to serialize short-lived writes.
- **Q:** Does SQLite WAL mode support many concurrent writers safely in this pattern? **A:** Yes — WAL allows concurrent readers + a single writer at a time, and our `INSERT OR IGNORE ... WHERE content_hash != ?` idempotency means duplicate writes are no-ops. Adequate for daemon + hook-process concurrency.
- **Q:** What if the daemon spawns successfully but never reaches `server.listening` (e.g., EACCES on the socket path)? **A:** Client's connect retry budget is ~2 s / 10 attempts at exponential backoff; after budget exhaustion the client throws `IndexerUnreachableError`. The caller (hook, serve mcp) logs it and proceeds WITHOUT the watcher — the CLI still works, it just doesn't auto-index. Same behavior as `FULCRUM_DISABLE_PCI=1`.
- **Q:** How do we avoid daemon state leaks when two agents close to the same project rapidly? **A:** 30 s grace timer on refcount=0 → watcher keeps running during rapid open/close churn. Same policy as the current singleton, so no behavior regression.

### Deferred to implementation

- Exact log format and location if we later add daemon logs (see "Deferred to separate tasks").
- Per-OS process priority — whether to `nice` the daemon on Linux / set `Below Normal` on Windows. Defer until we see CPU pressure in real use.
- Whether `fulcrum doctor` should probe the daemon (ping via client). Small surface, nice-to-have; not a PR-1 blocker.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Wire protocol (NDJSON, request/response):**

```
# Request
{"id": 42, "method": "ensureWatching", "params": {"root": "/home/mkh/workspace/pi-stack-plan"}}\n

# Response (success)
{"id": 42, "result": {"watch": "/home/mkh/workspace/pi-stack-plan", "relative_path": "", "already_watched": false}}\n

# Response (error)
{"id": 42, "error": {"code": "vault_owned_path", "message": "refusing to watch vault-owned path ~/.fulcrum/vault"}}\n

# Unsolicited daemon event (future — not in scope for initial PRs)
{"event": "file_changed", "watch": "/home/mkh/workspace/pi-stack-plan", "rel": "packages/cli/src/index.ts", "kind": "change"}\n
```

**Methods (MVP):**
| Method | Params | Result |
|---|---|---|
| `ping` | `{}` | `{ ok: true, version: string, started_at: ISO, active_watches: number }` |
| `ensureWatching` | `{ root: string }` | `{ watch, relative_path, already_watched }` |
| `releaseWatching` | `{ root: string }` | `{ watch, refcount }` |
| `getStatus` | `{}` | `{ projects: [{ root, refcount, code_chunks_count, memories_count, watcher_active }] }` |
| `triggerReindex` | `{ root: string }` | `{ files_scanned, chunks_created, took_ms }` |
| `shutdown` | `{}` | `{ ok: true }` — graceful exit used by tests |

**Auto-spawn state machine (client side):**

```
connect(sockPath)
    │
    ├─► OK: stream opened, send queued requests ────────────────┐
    │                                                            │
    ├─► ECONNREFUSED / ENOENT:                                   │
    │      spawn('fulcrum', ['daemon', 'indexer'], detached:true)│
    │      loop: for attempt in 1..10                            │
    │              sleep 100ms * 2^attempt (capped 500ms)        │
    │              connect(sockPath)                             │
    │              on ok → break ──────────────────────────────►─┤
    │              on ECONNREFUSED → continue                    │
    │      on budget exhausted → throw IndexerUnreachableError   │
    │                                                            │
    └─► other error → surface as IndexerError                    │
                                                                 │
                                                                 ▼
                                                       client ready to serve
```

**Daemon per-project entry:**

```
class DaemonEntry {
    realpath: string
    refcount: number
    graceTimer: NodeJS.Timeout | null
    syncer: PciSyncerHandle          // existing startPciSyncer() result
    attachedClients: Set<ClientConnId>
}
```

---

## Standard Task Workflow

Every task in this plan follows the same nine-step workflow documented in `docs/plans/2026-04-16-memory-v2a-plan.md` — Orient, Load Context, Source-Verify, Open Run, TDD Slice, Heartbeat, Build/Verify, Self-Review, Close Run + Record Decision. Repeated verbatim from that plan. See the v2a plan's "Standard Task Workflow" section for the full skill/MCP tool mapping.

**On block:** `mcp__fulcrum__block_agent_run` with explicit `reason`.

**On error:** `agent-skills:debugging-and-error-recovery`. No guess-fixing.

---

## Bootstrap Mode

**Which PRs are bootstrap-risky:**

| PR | Why | Mitigation |
|---|---|---|
| **PR 4 (rewire + delete)** | Deletes `lock.ts` + `singleton.ts` while the engineer's own Claude Code / PI / Codex session may still be running a `fulcrum serve mcp` that imported them. Restarting the MCP mid-PR flips the code path from lock-based to daemon-based. | **Land PR 4 as two commits.** Commit A: add daemon-backed `lifecycle.ts` code paths, keep old imports as dead code. Commit B: delete `lock.ts` + `singleton.ts` and remove dead imports. Between commits, restart the engineer's long-lived MCP process so it picks up commit A cleanly before commit B removes the fallback. |
| **PR 5 (hardening)** | Adds crash-recovery tests that intentionally kill the daemon; if the engineer's own daemon is serving the session, the test might target the wrong PID. | Tests spawn their own daemon at a custom socket path under `${tmpdir()}/fulcrum-indexer-test-${ulid}.sock`. Never touch the real per-user socket. |

PRs 1–3 are greenfield (new files only) and have zero bootstrap risk.

**Substitute mapping when inside bootstrap mode (PR 4, commit B):**
- Don't rely on `mcp__fulcrum__*` tools during the window where your Claude Code session's MCP is mid-restart.
- Use `Bash` + `git` + `Read`/`Edit`/`Write` for everything. Write decision notes to a temporary file under `docs/decisions/2026-04-18-pr-4-bootstrap.md`, then discard post-merge.
- Skills (`agent-skills:*`, `compound-engineering:*`, `find-docs`) stay safe — they don't depend on fulcrum's own MCP.

---

## Per-PR Quality Gates

Every PR must pass:

- [ ] All tasks in the PR marked `- [x]`.
- [ ] `pnpm -r build` passes on clean checkout.
- [ ] `pnpm -r test` passes — no new failures; existing suites (memory 602, cli 374, monitor 112, core 574) stay green.
- [ ] `pnpm check:cycles` passes (no circular deps introduced between `memory/src/indexer/*` and `memory/src/pci/*`).
- [ ] The Verify commands listed on each task all pass.
- [ ] `agent-skills:code-review-and-quality` (five-axis self-review) passes.
- [ ] `compound-engineering:ce-review` tiered-persona review passes.
- [ ] PR description generated via `compound-engineering:ce-pr-description`.
- [ ] No file under a project directory is written by the daemon or client (`docs/` allowed as the sole exception for plan/decision notes).

Per-PR-specific gates:

- **PR 1** additionally: NDJSON framer tests cover `{partial line, multi-line in one chunk, CR-LF vs LF, invalid JSON mid-stream}`. Socket-path tests cover POSIX + Windows branches (mock `process.platform`).
- **PR 2** additionally: watch-consolidation test asserts the Watchman-style `{watch, relative_path}` behavior for nested requests. VaultOwnedPathError is still rejected end-to-end.
- **PR 3** additionally: idle-timeout test uses fake timers; no real 30-min sleep. `triggerReindex` test uses a tiny fixture project with ≤5 files.
- **PR 4** additionally: full integration test — spawn daemon, run `fulcrum serve mcp --no-monitor` in a subprocess, assert `code_chunks` grows when a file is edited, kill MCP, assert watcher stays because daemon is still alive, kill daemon, assert next MCP spawn respawns daemon and indexing resumes.
- **PR 5** additionally: crash-recovery test kills daemon mid-request; client retries and succeeds. EADDRINUSE race test: two clients spawn concurrently, one daemon wins.

---

## Implementation Units

### PR 1 — Wire protocol, socket path, client/daemon skeleton (no chokidar yet)

- [ ] **Unit 1.1: NDJSON protocol codec**

**Goal:** A pure TypeScript module that encodes one JSON request/response per line and decodes a stream of such lines, surfacing partial-line buffering and invalid-JSON rejection.

**Requirements:** R3 (same code path on all platforms).

**Dependencies:** None.

**Files:**
- Create: `packages/memory/src/indexer/protocol.ts`
- Test: `packages/memory/src/indexer/tests/protocol.test.ts`

**Approach:**
- Export types `IndexerRequest`, `IndexerResponse`, `IndexerError`, `IndexerEvent`.
- Export `encode(msg): Buffer` (JSON.stringify + `\n`).
- Export `createDecoder(): { feed(chunk: Buffer): IndexerMessage[] }` — stateful, buffers partial trailing line, splits on `\n`, JSON.parses each complete line, throws on malformed JSON mid-stream.
- Export `allocateRequestId(): number` — monotonic counter, wraps at `Number.MAX_SAFE_INTEGER / 2`.

**Execution note:** Test-first. Write decoder tests (partial chunks, multi-message chunks, invalid JSON) before writing the decoder.

**Patterns to follow:** None locally — use node's `Buffer` and `.toString('utf8')` directly. No new runtime dependency.

**Test scenarios:**
- Happy path — encode(req) → Buffer ending in `\n`; decoder.feed(buffer) → [req].
- Happy path — two full messages in one feed → [msg1, msg2].
- Edge case — one message split across three feeds → emits exactly once after final `\n`.
- Edge case — empty feed → [].
- Edge case — trailing partial line without newline → buffered, no emission until next feed closes it.
- Edge case — LF-only; CR-LF tolerated (CR stripped before parse).
- Error path — invalid JSON mid-stream → decoder throws `DecoderError` with the offending line text truncated to 200 chars.
- Error path — message exceeds 16 MB soft cap → decoder throws `MessageTooLargeError`.

**Verification:** `pnpm --filter fulcrum-memory test protocol` passes; decoder correctly handles all boundary cases.

---

- [ ] **Unit 1.2: Platform-branched socket path resolver**

**Goal:** Deterministic socket path selection for POSIX vs Windows, rooted at `globalDataDir()` on POSIX.

**Requirements:** R3, R6 (global-only data).

**Dependencies:** `packages/core/src/db/client.ts` `globalDataDir` export.

**Files:**
- Create: `packages/memory/src/indexer/socket-path.ts`
- Test: `packages/memory/src/indexer/tests/socket-path.test.ts`

**Approach:**
- Export `indexerSocketPath(): string`.
- On `process.platform === 'win32'`: return `\\\\.\\pipe\\fulcrum-indexer-${os.userInfo().username}`.
- Else: return `join(globalDataDir(), 'fulcrum-indexer.sock')`. Ensure `globalDataDir()` exists (mkdir p).
- Export `unlinkStaleSocket(path)` — POSIX-only, silently unlinks a socket path if the file exists and nothing is bound (used by daemon at startup to clean up after a crashed predecessor whose socket file lingered).

**Patterns to follow:** `packages/memory/src/pci/lock.ts#lockPathFor` pattern of `mkdirSync` + deterministic path. Mirror the defensive `mkdir` behavior.

**Test scenarios:**
- Happy path — POSIX: `indexerSocketPath()` returns `<globalDataDir>/fulcrum-indexer.sock`; directory is ensured.
- Happy path — Windows: stub `process.platform = 'win32'` + `os.userInfo` returning `alice`; returns `\\\\.\\pipe\\fulcrum-indexer-alice`.
- Edge case — user name contains spaces (Windows) → still produces a valid pipe name (escaping rules: spaces are legal).
- Edge case — stale socket unlink → `unlinkStaleSocket(path)` is a no-op when the path does not exist; silently removes when it does.

**Verification:** Test stubs both platforms via `vi.stubGlobal` or `process.platform` monkey-patch. Tests pass.

---

- [ ] **Unit 1.3: Daemon skeleton (ping + shutdown only, no chokidar)**

**Goal:** A standalone node entrypoint that listens on the resolved socket path, accepts NDJSON requests, handles `ping` + `shutdown`, and exits on SIGTERM.

**Requirements:** R1, R5.

**Dependencies:** Unit 1.1, Unit 1.2.

**Files:**
- Create: `packages/memory/src/indexer/daemon.ts`
- Create: `packages/memory/src/indexer/handlers.ts` (initially only `ping`, `shutdown`)
- Test: `packages/memory/src/indexer/tests/daemon-ping.test.ts` (integration)

**Approach:**
- `main()` creates the server via `net.createServer`, listens on `indexerSocketPath()`.
- On `listen` EADDRINUSE: probe the existing socket with a `ping` request on a short timeout. If the ping succeeds, exit 0 silently (another daemon is already up). If the ping fails/times out, call `unlinkStaleSocket(path)` then retry listen once.
- On each client connection: wrap the socket in the NDJSON decoder. For each decoded request, dispatch to `handlers[method]`; write the response; on unknown method, respond with `IndexerError{code: 'unknown_method'}`.
- Handle SIGTERM / SIGINT: close the server, end all open sockets, exit 0.
- Log startup/shutdown to stderr only (since stdio is typically `'ignore'` when spawned detached). Format: `[fulcrum-indexer] listening on ${path}`.

**Execution note:** Test-first. Integration test spawns the daemon as a subprocess, connects from the test harness, sends `ping`, asserts the result shape, sends `shutdown`, asserts the daemon exits.

**Patterns to follow:** `packages/monitor/src/server.ts` — existing loopback-server patterns for binding + SIGTERM handling.

**Test scenarios:**
- Happy path — spawn daemon → connect → `ping` → `{ ok: true, version, started_at, active_watches: 0 }`.
- Happy path — `shutdown` method closes the socket and the daemon process exits with code 0 within 500 ms.
- Edge case — daemon starts when socket path file already exists from a previous run with no active listener → daemon unlinks stale socket and listens successfully.
- Edge case — second daemon attempts to start while first is active → second pings the first, observes it alive, exits 0 cleanly (no crash, no duplicate daemon).
- Error path — unknown method → error response, connection stays open for further requests.
- Error path — malformed JSON on the wire → daemon logs + closes that client connection; other clients unaffected.

**Verification:** `pnpm --filter fulcrum-memory test daemon-ping` passes. Manual sanity: `fulcrum daemon indexer &` then `echo '{"id":1,"method":"ping"}' | nc -U $(fulcrum daemon sockname)` returns a valid response.

---

- [ ] **Unit 1.4: Indexer client with connect-and-autospawn**

**Goal:** A client module that clients (CLI commands, hook invocations, future consumers) use to send RPCs to the daemon. Handles auto-spawn, reconnect on mid-request socket close, and request/response correlation by `id`.

**Requirements:** R5, R6.

**Dependencies:** Unit 1.1, Unit 1.2, Unit 1.3.

**Files:**
- Create: `packages/memory/src/indexer/client.ts`
- Test: `packages/memory/src/indexer/tests/client-autospawn.test.ts`

**Approach:**
- Export `indexerClient` singleton with methods `ping()`, `shutdown()` (others added in PR 2/3).
- Internal state: current socket (or null), pending-request Map<id, {resolve, reject}>, request queue buffered during connect.
- On first request: call `net.connect(socketPath)`:
  - On connect: flush pending queue.
  - On `ECONNREFUSED`/`ENOENT`: call `spawnDetachedDaemon()`, then retry connect with exponential backoff (100 ms → 500 ms, up to 10 attempts / ~3 s total).
  - On budget exhausted: reject all pending with `IndexerUnreachableError`.
- On mid-request connection close: existing pending requests reject with `IndexerDisconnectedError`. Caller decides whether to retry.
- Export `shutdownClient()` for test teardown.
- Export `IndexerUnreachableError`, `IndexerDisconnectedError`, `IndexerError` classes.

**Execution note:** Test-first. Use a fake server that accepts + drops the first connection to exercise reconnect; mock `child_process.spawn` to capture auto-spawn invocations.

**Patterns to follow:** The existing `packages/cli/src/log.ts` span-based request correlation pattern — inspect `startSpan` / `endSpan` for how we already correlate async operations by id.

**Test scenarios:**
- Happy path — daemon running → `client.ping()` resolves with ping result.
- Happy path — daemon NOT running → `client.ping()` triggers spawn, waits, resolves. `spawn` is called with `['fulcrum', 'daemon', 'indexer']`, `detached: true`, `stdio: 'ignore'`.
- Edge case — two concurrent calls before connect completes → both queued; both resolve after connect; each gets its own `id`.
- Edge case — daemon is reachable on first connect but dies mid-request → pending request rejects with `IndexerDisconnectedError`; subsequent call reconnects (and respawns if needed).
- Error path — spawn fails (e.g., `fulcrum` not on `PATH`) → `IndexerUnreachableError` with underlying spawn errno exposed on `.cause`.
- Error path — socket-path EACCES → error surfaces immediately, no spawn attempt.
- Integration — client ↔ daemon round-trip with real `net` sockets in a test temp dir. Uses a temp-dir socket path (not the global one) via `FULCRUM_INDEXER_SOCKET` env var override.

**Verification:** `pnpm --filter fulcrum-memory test client-autospawn` passes. Integration test + unit tests green.

---

- [ ] **Unit 1.5: CLI subcommand `fulcrum daemon indexer` + `fulcrum daemon sockname`**

**Goal:** Wire the new daemon entrypoint into the main CLI. No other CLI call sites change yet; only the daemon itself becomes invocable.

**Requirements:** R3.

**Dependencies:** Unit 1.3.

**Files:**
- Create: `packages/cli/src/commands/daemon.ts`
- Modify: `packages/cli/src/index.ts` — dispatch `group === 'daemon'` → `runDaemon()`. Help text updated.
- Test: `packages/cli/src/tests/daemon-command.test.ts`

**Approach:**
- `runDaemon(args: string[])`:
  - `args[0] === 'indexer'` → import and call `packages/memory/src/indexer/daemon.ts#main()`.
  - `args[0] === 'sockname'` → print the resolved socket path to stdout and exit 0. `--ensure` flag: additionally trigger `indexerClient.ping()` so the daemon is running before returning.
  - Unknown → usage + exit 1.
- Update the usage block near the top of `index.ts` to include the daemon subcommand.

**Patterns to follow:** The existing `group === 'serve'` dispatch in `packages/cli/src/index.ts` lines ~2746–2800.

**Test scenarios:**
- Happy path — `fulcrum daemon sockname` prints the expected path, exit 0.
- Happy path — `fulcrum daemon sockname --ensure` spawns daemon if absent, then prints the path.
- Error path — `fulcrum daemon whatever` prints usage to stderr, exit 1.

**Verification:** `pnpm --filter fulcrum-agent-cli test daemon-command` passes. Manual: `./fulcrum daemon sockname` returns a valid path.

---

### PR 2 — ensureWatching + releaseWatching + chokidar delegation

- [ ] **Unit 2.1: Daemon-side project registry**

**Goal:** A `DaemonRegistry` module inside the daemon process that owns the per-project chokidar instances, implements refcount + grace-period teardown, rejects vault-owned paths, and supports Watchman-style watch consolidation.

**Requirements:** R2, R7.

**Dependencies:** PR 1; existing `packages/memory/src/pci/syncer.ts` (`startPciSyncer`), `packages/memory/src/pci/lifecycle.ts` (`resolveProjectRoot`), `VaultOwnedPathError` from the existing singleton.

**Files:**
- Create: `packages/memory/src/indexer/registry.ts`
- Test: `packages/memory/src/indexer/tests/registry.test.ts`
- Test: `packages/memory/src/indexer/tests/daemon-watch-consolidation.test.ts`

**Approach:**
- Export `DaemonRegistry` class with methods:
  - `ensureWatching(root: string): { watch, relative_path, already_watched }` — realpath-resolve the input; scan existing entries for one that is an ancestor (Watchman-style); if found, increment refcount and return with `relative_path`; else `startPciSyncer(...)` and create a new entry. Refuse vault paths.
  - `releaseWatching(root: string): { watch, refcount }` — realpath-resolve; find entry; decrement refcount; schedule 30 s grace-timer teardown when reaching 0.
  - `getStatus(): ProjectStatus[]` — snapshot of active entries.
  - `shutdownAll(): void` — teardown everything immediately (used on SIGTERM).
- The registry is the only place in the new code that calls `startPciSyncer` — keeps the daemon file focused on wire handling.

**Execution note:** Test-first. Treat watch consolidation, refcount correctness, and vault rejection as three separate suites.

**Patterns to follow:** `packages/memory/src/pci/singleton.ts` — `ensure()` refcount + grace-timer + vault-owned rejection. This is essentially the same logic rebound to an in-memory registry (no cross-process lock needed, since the daemon is the single process).

**Test scenarios:**
- Happy path — `ensureWatching('/a/b')` first call → starts syncer, `{watch:'/a/b', relative_path:'', already_watched:false}`, refcount=1.
- Happy path — second `ensureWatching('/a/b')` → refcount=2, `already_watched:true`, no second chokidar started.
- Happy path — `ensureWatching('/a/b/c')` after `ensureWatching('/a/b')` → consolidated; returns `{watch:'/a/b', relative_path:'c', already_watched:true}`.
- Edge case — `ensureWatching('/a')` after `ensureWatching('/a/b')` → new entry at `/a`; `/a/b` remains (we do not re-parent; simpler than Watchman and still correct because the new, larger subtree covers the old one and the refcount stays on the older entry until released).
- Edge case — `releaseWatching` dropping refcount to 0 → 30 s grace timer → after grace, `closeWatcher`, registry entry deleted. With fake timers, teardown fires at T+30 s.
- Edge case — release then re-ensure within grace → grace timer cancelled; refcount=1 on the same entry.
- Error path — `ensureWatching` on vault-owned path (`~/.fulcrum/vault`) → throws `VaultOwnedPathError`; no entry created.
- Error path — `ensureWatching` on non-existent directory → syncer error surfaces via rejection; entry not created.

**Verification:** `pnpm --filter fulcrum-memory test registry` and `daemon-watch-consolidation` pass.

---

- [ ] **Unit 2.2: Daemon handlers for ensureWatching + releaseWatching**

**Goal:** Wire the registry into the daemon's request dispatcher.

**Requirements:** R2.

**Dependencies:** Unit 1.3 (handlers dispatch), Unit 2.1.

**Files:**
- Modify: `packages/memory/src/indexer/daemon.ts` — instantiate a `DaemonRegistry` at startup; pass to handlers.
- Modify: `packages/memory/src/indexer/handlers.ts` — add `ensureWatching`, `releaseWatching` method handlers; input validation (root must be absolute string).
- Test: extends `daemon-watch-consolidation.test.ts` from Unit 2.1 with one end-to-end integration (real daemon subprocess + real client).

**Approach:**
- Handlers are thin shims that validate input, call the registry, map `VaultOwnedPathError` → `IndexerError{code:'vault_owned_path'}`.
- Non-absolute `root` → `IndexerError{code:'invalid_params'}`.

**Patterns to follow:** The handler pattern set in Unit 1.3 (`handlers[method] = fn`).

**Test scenarios:**
- Integration — daemon subprocess + real client: `ensureWatching('/tmp/some-test-tree')`, then `ls`, edit a file, assert `code_chunks` grew by the expected number of rows for the test fixture.
- Error path — `ensureWatching({})` (no root) → `IndexerError{code:'invalid_params'}`.
- Error path — relative path → `IndexerError{code:'invalid_params'}`.
- Integration — `releaseWatching` after `ensureWatching` → refcount decremented; watcher torn down after grace.

**Verification:** Integration test covers the full round-trip. All existing `fulcrum-memory` tests still green.

---

- [ ] **Unit 2.3: Client API for ensureWatching + releaseWatching**

**Goal:** Expose the ensure/release methods on the shared client.

**Dependencies:** Unit 1.4, Unit 2.2.

**Files:**
- Modify: `packages/memory/src/indexer/client.ts` — add `ensureWatching(root)` and `releaseWatching(root)` methods that delegate to the RPC.
- Modify: `packages/memory/src/index.ts` — export `indexerClient` and type definitions.
- Test: integration test inside `client-daemon-roundtrip.test.ts`.

**Approach:**
- Methods are one-liners over the existing `request(method, params)` primitive.
- Errors on the wire (`IndexerError`) are re-thrown as `IndexerError` client-side so callers can pattern-match the `.code`.

**Test scenarios:**
- Integration — happy path round-trip; see Unit 2.2.
- Error propagation — daemon returns `vault_owned_path` error → client rejects with the same code on the thrown `IndexerError`.

**Verification:** Integration test passes.

---

### PR 3 — getStatus + triggerReindex + idle timeout

- [ ] **Unit 3.1: getStatus handler + client method**

**Goal:** Observability surface for the daemon.

**Dependencies:** PR 2.

**Files:**
- Modify: `packages/memory/src/indexer/registry.ts` — add `snapshot(): ProjectStatus[]` with `{root, refcount, code_chunks_count, memories_count, watcher_active}`.
- Modify: `packages/memory/src/indexer/handlers.ts` — add `getStatus` handler.
- Modify: `packages/memory/src/indexer/client.ts` — add `getStatus()` method.
- Test: `packages/memory/src/indexer/tests/daemon-status.test.ts`.

**Approach:**
- `code_chunks_count` / `memories_count` are lookups into the shared SQLite: `SELECT COUNT(*) FROM code_chunks WHERE project_id = ?`. Derive project_id from `projectIdsFromPath(realpath)`.
- Expose via integration as a single snapshot per call.

**Test scenarios:**
- Happy path — with two active watches, `getStatus` returns two entries.
- Happy path — counts reflect actual DB state (write a memory; status count goes up).
- Edge case — empty registry → `{projects: []}`.

**Verification:** Test passes.

---

- [ ] **Unit 3.2: triggerReindex handler + client method**

**Goal:** Force a one-shot `ingestProject` via RPC, for cases where the watcher missed events (FS type that doesn't support inotify well) or the user wants a deliberate full rescan.

**Dependencies:** PR 2; existing `packages/memory/src/ingest.ts`.

**Files:**
- Modify: `packages/memory/src/indexer/handlers.ts` — add `triggerReindex` handler that calls `ingestProject({workspace_id, project_id, root_path})`.
- Modify: `packages/memory/src/indexer/client.ts` — add `triggerReindex(root)`.
- Test: `packages/memory/src/indexer/tests/daemon-reindex.test.ts`.

**Approach:**
- Resolve `workspace_id`/`project_id` via `projectIdsFromPath(realpath)` — no DB lookup needed because IDs are deterministic from path.
- Return `{files_scanned, chunks_created, memories_created, took_ms}`.
- Concurrency — if the same root is already being reindexed, queue the second request (promise dedup by root).

**Test scenarios:**
- Happy path — `triggerReindex(testDir)` with a 5-file fixture → result reports 5 files scanned, positive chunks_created.
- Edge case — back-to-back calls for the same root → second awaits first; both resolve with the same result shape.

**Verification:** Test passes; `code_chunks` grows as expected.

---

- [ ] **Unit 3.3: Idle-timeout auto-exit**

**Goal:** Daemon self-exits after N minutes of no active watches and no in-flight requests.

**Requirements:** R6.

**Dependencies:** PR 2.

**Files:**
- Modify: `packages/memory/src/indexer/daemon.ts` — idle-timer state; resets on every request and on watch add; fires `process.exit(0)` when elapsed.
- Test: `packages/memory/src/indexer/tests/daemon-idle-timeout.test.ts`.

**Approach:**
- Idle defined as: `activeWatches === 0 AND inFlightRequests === 0` for N ms (default 30 min; env override `FULCRUM_INDEXER_IDLE_MS`).
- Timer stored in `daemon.ts` module scope; reset by a `bumpActivity()` helper called from every handler entry and from every client-connection event.
- Clean shutdown: `server.close()` + `registry.shutdownAll()` + `process.exit(0)`.

**Test scenarios:**
- Happy path — with fake timers, idle timeout fires after no activity for the configured duration; daemon exits 0.
- Happy path — request arriving mid-window resets the timer; daemon stays up.
- Edge case — an active watch keeps the daemon up indefinitely even without requests.

**Verification:** Test passes using `vi.useFakeTimers()`.

---

### PR 4 — Rewire existing call sites + delete lock.ts + singleton.ts

**Bootstrap risk:** see Bootstrap Mode above. This PR lands in TWO commits; do not squash.

- [ ] **Unit 4.1 (commit A): rewrite lifecycle.ts on top of indexerClient; keep old imports as dead code**

**Goal:** Change the implementation of `onAgentRunStart` / `onAgentRunEnd` / `acquireServerHandle` / `releaseServerHandle` / `resolveProjectRoot` to route through `indexerClient`, without deleting `singleton.ts` or `lock.ts` yet.

**Dependencies:** PR 2, PR 3.

**Files:**
- Modify: `packages/memory/src/pci/lifecycle.ts` — new implementation. Keep the public call signatures identical.
- Keep (for one commit): `packages/memory/src/pci/lock.ts`, `packages/memory/src/pci/singleton.ts` — orphaned but present so that any mid-merge tool still sees them on the disk.

**Approach:**
- `onAgentRunStart({run_id, project_id, db})` → resolve `root` from `db`; if `null`, no-op; else `indexerClient.ensureWatching(root)`; store `root` in a local `run_id → root` map for `onAgentRunEnd`.
- `onAgentRunEnd(run_id)` → read map; `indexerClient.releaseWatching(root)`.
- `acquireServerHandle(root)` → `indexerClient.ensureWatching(root)`; return a handle object that `releaseServerHandle` can use.
- Errors from the client (`IndexerUnreachableError`) are swallowed and logged to stderr; caller-visible behavior is "no watcher mounted, CLI still works" — matching today's `FULCRUM_DISABLE_PCI=1` behavior.

**Execution note:** Implement on a separate branch. Land commit A first; engineer MUST restart any long-lived `fulcrum serve mcp` before commit B is pushed.

**Test scenarios:**
- All existing `packages/memory/src/tests/` suites stay green with the new internals.
- Unit test — `onAgentRunStart` calls `indexerClient.ensureWatching` once with the resolved root.
- Unit test — `onAgentRunEnd` calls `releaseWatching` with the same root tracked from start.
- Error path — client unreachable → warning logged, caller gets `null`, agent run continues (non-fatal).

**Verification:** Full test matrix green. Manual: restart MCP, observe "[fulcrum] PCI watcher mounted" log now originating from the daemon (attached), and `fulcrum daemon sockname --ensure` returns a live path.

---

- [ ] **Unit 4.2 (commit B): delete lock.ts + singleton.ts**

**Goal:** Remove the now-orphan code.

**Dependencies:** Unit 4.1 merged AND engineer's long-lived MCP processes restarted to consume commit A.

**Files:**
- Delete: `packages/memory/src/pci/lock.ts`
- Delete: `packages/memory/src/pci/singleton.ts`
- Delete: `packages/memory/src/pci/tests/lock.test.ts` (if present) — replaced by daemon socket-bind tests in PR 1.
- Delete: `packages/memory/src/pci/tests/singleton.test.ts` (if present) — replaced by registry tests in PR 2.
- Modify: `packages/memory/src/index.ts` — remove any remaining `lock`/`singleton` exports; confirm `isWatcherOwnedHere` is no longer exported (was a stopgap added during the lock era).
- Modify: `packages/cli/src/index.ts` — remove the `isWatcherOwnedHere` call sites in `runServeMcp` and `runServeMonitor`; the client now abstracts this (ensureWatching tells us via `already_watched`).

**Test scenarios:**
- `pnpm check:cycles` still clean.
- `pnpm -r build` clean.
- Every test suite green.
- Grep for `lockPathFor`, `acquireLock`, `LockError`, `PciEntry`, `shutdownAll` (from singleton) across the workspace — zero references outside the deleted files and their tests.

**Verification:** Clean repo, green CI. `ls packages/memory/src/pci/` no longer lists `lock.ts` or `singleton.ts`.

---

- [ ] **Unit 4.3: serve mcp + serve monitor use indexerClient explicitly**

**Goal:** Replace the current `acquireServerHandle(process.cwd())` calls with explicit `await indexerClient.ensureWatching(process.cwd())`. The log line stays informative (`[fulcrum] PCI watcher mounted on <root>` vs `attached to existing watcher`).

**Dependencies:** Unit 4.2.

**Files:**
- Modify: `packages/cli/src/index.ts` — `runServeMcp` and `runServeMonitor` blocks that currently call `acquireServerHandle`.

**Approach:**
- Use `result.already_watched ? 'attached to existing' : 'mounted new'` for the log.
- On `IndexerUnreachableError`: log `[fulcrum] indexer daemon unreachable; code-index will be stale until next start_agent_run` and proceed.

**Test scenarios:**
- Unit test — stubbed `indexerClient` returns `already_watched: false` → log says "mounted". Returns `true` → log says "attached to existing".
- Existing serve-mcp smoke-test integration still green.

**Verification:** `pnpm --filter fulcrum-agent-cli test` green; manual smoke: `./fulcrum serve mcp --no-monitor &` followed by `./fulcrum daemon sockname --ensure` both succeed without stale-lock messages.

---

### PR 5 — Crash recovery, race safety, hardening

- [ ] **Unit 5.1: Daemon crash mid-request — client reconnect**

**Goal:** When a client has an in-flight request and the daemon dies, the client reconnects (respawning if needed) and the caller sees a retriable error.

**Dependencies:** PR 4.

**Files:**
- Modify: `packages/memory/src/indexer/client.ts` — on `socket close` with pending requests, reject each with `IndexerDisconnectedError`. Callers choose whether to retry; `lifecycle.ts` wrappers apply a bounded retry (2 attempts).
- Test: `packages/memory/src/indexer/tests/client-daemon-crash-recovery.test.ts`.

**Test scenarios:**
- Integration — spawn daemon, issue `ensureWatching` request, kill daemon mid-flight with SIGKILL → client rejects with `IndexerDisconnectedError` → next call respawns daemon, succeeds.
- Edge case — daemon killed with SIGKILL repeatedly in a loop → no zombie child processes accumulate; client eventually succeeds when the host quiesces.

**Verification:** Tests pass.

---

- [ ] **Unit 5.2: Two clients race to spawn**

**Goal:** Two concurrent clients calling `ensureWatching` when no daemon exists MUST both succeed, and exactly one daemon MUST end up listening.

**Dependencies:** PR 4.

**Files:**
- Test: same file as 5.1 or sibling. Uses two Promises invoked simultaneously in one process to simulate two CLIs from a human perspective.

**Approach:**
- Relies on PR 1's existing EADDRINUSE fallback in the daemon `main()` — second daemon observes bind failure, pings the first, exits cleanly.

**Test scenarios:**
- Integration — no daemon running; `Promise.all([client.ping(), client.ping()])` spawns one daemon, both calls resolve.
- Edge case — two separate processes each spawning daemons concurrently (use `child_process.fork` for the second) — at steady state, exactly one daemon listens on the socket.

**Verification:** Tests pass. `lsof -U | grep fulcrum-indexer` shows exactly one listener after the test.

---

- [ ] **Unit 5.3: NFS / CIFS / overlayfs compatibility smoke-test (POSIX)**

**Goal:** Daemon and chokidar continue to function on filesystems where `fs.watch` is unreliable. The daemon's internal fallback to polling is already in `packages/memory/src/pci/watcher.ts#pollingRescan`, but we add a smoke test.

**Dependencies:** PR 4.

**Files:**
- Test: `packages/memory/src/indexer/tests/daemon-fs-compat.test.ts`.

**Approach:**
- Use a `detect-fs.ts` override env var to force-report "NFS" for the test tree, verify the daemon logs the warning and uses polling. No real NFS mount required.

**Test scenarios:**
- Happy path — forced NFS detection → daemon log includes `filesystem detected: NFS; polling fallback active`.
- Happy path — polling fallback still writes `code_chunks` rows on file change.

**Verification:** Test passes.

---

- [ ] **Unit 5.4: Daemon exit log + error-surface consolidation**

**Goal:** All daemon exits — graceful, idle-timeout, crash — leave one consistent log line so operators can tell what happened. Every error surfaced via the wire protocol maps to a documented `IndexerError.code`.

**Dependencies:** PR 4.

**Files:**
- Modify: `packages/memory/src/indexer/daemon.ts` — uncaught-exception handler → write a short line to stderr, attempt graceful shutdown, exit 1.
- Modify: `packages/memory/src/indexer/protocol.ts` — document the `IndexerError.code` values in a jsdoc comment (`unknown_method | invalid_params | vault_owned_path | not_watching | busy | internal`).

**Test scenarios:**
- Happy path — idle-timeout triggers log `[fulcrum-indexer] idle timeout reached; exiting`.
- Happy path — SIGTERM triggers log `[fulcrum-indexer] received SIGTERM; graceful shutdown`.
- Error path — handler throws unexpected → log `[fulcrum-indexer] uncaught: ...`, exit 1.

**Verification:** Manual log-format verification; tests green.

---

- [ ] **Unit 5.5: Documentation + cross-reference from daemon.ts header**

**Goal:** Future maintainers land here from code.

**Files:**
- Modify: `packages/memory/src/indexer/daemon.ts` — top-of-file comment references this plan doc and the Watchman prior-art.
- Modify: `CHANGELOG.md` — one entry under Unreleased for the daemon refactor.
- Update: `README.md` — one-paragraph mention of the daemon in the architecture section if present (skip if README doesn't have one).

**Test scenarios:** none — documentation-only. `Test expectation: none — pure documentation unit.`

**Verification:** Link from `daemon.ts` resolves to this file.

---

## System-Wide Impact

- **Interaction graph:** `fulcrum serve mcp`, `fulcrum serve monitor`, `fulcrum serve all`, every hook invocation (via `PostToolUse` path that currently calls `ingestFile` directly — unchanged), `start_agent_run` (via `onAgentRunStart`), `complete_agent_run` (via `onAgentRunEnd`), the future cockpit reindex trigger. All of them now go through `indexerClient`, which owns the daemon lifecycle.

- **Error propagation:** `IndexerUnreachableError` from the client is the new "no watcher available" signal — treated as equivalent to today's `FULCRUM_DISABLE_PCI=1`: log + proceed. Nothing in the user-facing CLI breaks when the daemon cannot start. `IndexerError` subtypes (`vault_owned_path`, `not_watching`) propagate back to the caller intact.

- **State lifecycle risks:** the daemon's in-memory registry is volatile. Client ensureWatching calls are idempotent (second call returns `already_watched: true` without side-effect), so a daemon respawn followed by client reconnect converges to the correct state after the next `onAgentRunStart` or `serve mcp` startup. No persistent daemon state on disk → nothing to corrupt.

- **API surface parity:** the public exports from `packages/memory/src/index.ts` (`onAgentRunStart`, `onAgentRunEnd`, `acquireServerHandle`, `releaseServerHandle`, `resolveProjectRoot`) keep their signatures and semantics. New additions: `indexerClient`, `IndexerUnreachableError`, `IndexerError`, `IndexerDisconnectedError`. Removed: `pciStatus`, `isWatcherOwnedHere` (rewired via `indexerClient.getStatus()` + `ensureWatching().already_watched`).

- **Integration coverage:** PR 4's full integration test (daemon + serve mcp + file edit + kill MCP + kill daemon + respawn) proves the model end-to-end. PR 5's crash-recovery + race tests cover the remaining edge cases.

- **Unchanged invariants:**
  - `ingestFile` / `ingestProject` contract unchanged.
  - `code_chunks` / `code_files` / `code_symbols` schema unchanged.
  - `hook_events` write path unchanged.
  - `sanitize-before-WAL` ordering unchanged.
  - `globalDataDir()` still holds all state. No project-local files.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Auto-spawn loop (daemon fails to start repeatedly, client keeps respawning) | Client retry budget is bounded (10 attempts / 3 s). After exhaustion, it throws `IndexerUnreachableError` and backs off — no runaway spawn loops. |
| Daemon holds too many inotify fds on a machine with many projects | Idle timeout (30 min default) + refcount-based teardown releases fds when projects go idle. Env override `FULCRUM_INDEXER_IDLE_MS` for tuning. |
| Windows named-pipe limitations (pipe name length, user-scope) | Username is sanitised (`[^a-zA-Z0-9_-] → _`) and capped at 64 chars. The per-user ACL is the default; no additional hardening. |
| PR 4 lands and the user's live MCP process keeps the old `lock.ts` code loaded | Commit A / Commit B split + explicit MCP restart checkpoint in the Bootstrap Mode section. |
| Long existing test suites get slower because every test now pulls `net`-related code | Tests use the `FULCRUM_INDEXER_SOCKET` env override to a temp-dir path. Unit tests that don't need IPC stub `indexerClient` directly. Integration tests are isolated. Target: daemon tests add ≤2 s to total CI time. |
| `fs.realpathSync` differences across OSes (Windows drive-letter canonicalization) | The realpath is resolved once per `ensureWatching` call and used as the map key. Consistent within a single daemon instance. |

---

## Documentation / Operational Notes

- **CHANGELOG.md**: one entry under "Unreleased" describing the daemon refactor.
- **README.md**: update the architecture section to mention the daemon model — keep it to one sentence.
- **`docs/guides/`**: defer a user-facing `daemon.md` until the architecture has baked for a release; initial release relies on this plan doc.
- **Migration story for existing users:** none needed at the data layer. First post-upgrade run auto-spawns the daemon; zombie lock files from the old design can be deleted by the user (`rm -f ~/.local/share/fulcrum/pci/*.lock`) or will be ignored (the new code does not look at that directory).

---

## Sources & References

- **This plan is working-tree-only per user preference** `feedback_never_commit_docs.md` — do NOT include in any commit alongside code.
- Watchman architecture — Facebook Watchman docs fetched via Context7 (`/facebook/watchman`) on 2026-04-18.
- Related code (existing, to be consumed or replaced): `packages/memory/src/pci/*.ts`, `packages/memory/src/ingest.ts`, `packages/cli/src/index.ts` lines 1424–1580, `packages/cli/src/hooks.ts` lines 305–360.
- Related commits (tonight's lock-era band-aids, all to be obsoleted by PR 4): `2649ad7`, `cc74d73`, `fc70b23`.
- Memory v2 plan (format prior art): `docs/plans/2026-04-16-memory-v2a-plan.md`.
