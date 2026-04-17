---
date: 2026-04-16
topic: memory-architecture-v2
part: "05"
title: Context Guards, Watcher, WAL, Sanitization
index: index.md
prev: 04-data-model.md
next: 06-hooks-dreaming-operations.md
---

# Memory Architecture v2 — 05 — Context Guards, Watcher, WAL, Sanitization

**[← Index](index.md)** · **[← Prev: Data Model](04-data-model.md)** · **[Next: Hooks, Dreaming, Operations →](06-hooks-dreaming-operations.md)**

## 5. Context-Type Guards (prior art + prior art both)

`start_agent_run` requires `context_type` as an explicit argument (defaults to `'primary'` for backward compatibility; callers in known non-primary paths must set it explicitly). Pi cockpit, cron dispatch, heartbeat loops, and subagent spawners are audited in Phase 2 to set the correct value.

Enforcement (in `fulcrum-memory` write path):

- Non-primary runs may only write `delegation_summary` (and that row is attributed to their `parent_run_id`, not to themselves).
- `recall_memory` called from a non-primary run returns an empty result with `reason: "non-primary context"`.
- All other writes from non-primary runs are silently dropped with a telemetry event (no exception, no block — prior art failure-isolation invariant).

prior art verbatim: "providers should skip writes for non-primary contexts (cron system prompts would corrupt user representations)."
prior art verbatim: "places where hidden personalization would be surprising."

---

## 5.5 Project Content Watcher — singleton, reference-counted

**One chokidar watcher per project root. Shared across all sessions in the process. Reference-counted lifecycle. Lock-file-protected across processes.**

The existing `startVaultWatcher(options)` (in `packages/memory/src/vault/watcher.ts`) watches `vaultPath/memories/**/*.md` only. This is extended and replaced by a unified `startProjectContentWatcher(root)` that watches both the memory vault and the source tree under a single chokidar instance.

### 5.5.1 Lifecycle

```
ProjectContentIndexManager (process singleton)
  │
  ├── ensure(projectRoot) -> Handle
  │     increments refcount for projectRoot
  │     starts watcher + initial scan on first call
  │     returns a Handle { stop() } that decrements on call
  │
  └── on refcount → 0 after 30s grace:
        stop chokidar, close DB handles, release lock file
```

- **Key.** `realpathSync(projectRoot)` — canonical, symlink-resolved. Prevents two sessions from spawning separate watchers for `./` and `/abs/path` of the same tree.
- **Refcount holders.** Every `start_agent_run` calls `manager.ensure(projectRoot)`; every `complete_agent_run` / `block_agent_run` / heartbeat-expiry calls `handle.stop()`. MCP server also holds a top-level handle while serving.
- **Grace period.** 30 seconds after refcount → 0 before actually stopping chokidar. Avoids thrash when sessions start/stop rapidly.
- **Cross-process lock.** `{globalDataDir()}/project-index-<sha256(realpath)>.lock` written with PID + start time. On manager start, stale locks (dead PIDs) are cleaned. If a live lock exists and belongs to another process, this process reads via the shared SQLite but does not start a watcher — that process owns change detection.

### 5.5.2 Ingest paths

- **Memory vault path.** `{globalDataDir()}/memory/short_term/**/*.md` and `durable/**/*.md`. Events → existing memory-vault pipeline (schema-validate, L1 upsert, L2 embed if durable).
- **Project source tree path.** `<projectRoot>/**` minus `.gitignore` globs, `node_modules`, `.fulcrum`, `dist`, `build`, `.turbo`, `target`, binary files, files > 1 MB. Events → code-index pipeline (re-chunk, update `code_files`/`code_chunks`/`code_symbols`, re-embed changed chunks, update Kuzu graph).

### 5.5.3 Change semantics

- `add` → ingest new file, chunk, embed, graph nodes + edges.
- `change` → diff chunks by `chunk_id` (hash of `file_id + start_line + content`); only new chunk ids get re-embedded. Removed chunk ids get evicted from vec + Kuzu.
- `unlink` → delete `code_files` row (cascade), evict all chunk vecs, remove file node + edges from Kuzu.
- `rename` (chokidar emits `unlink` + `add`) → detect by matching body hash across events within 500ms; preserve chunk ids that didn't change content.

### 5.5.4 Initial scan

On first `ensure(projectRoot)`: runs `ingestProject` under an incremental strategy — compare `code_files.sha256` to on-disk SHA for each candidate file. Skip files whose SHA is unchanged (already indexed). Process changed/new files only. The existing `ingestProject` in `packages/memory/src/ingest.ts` is extended to support this incremental mode; current full-rescan mode stays available as `--force`.

### 5.5.5 Watcher telemetry

- Emit `content_change` events on `fulcrum-core` event stream: `{projectRoot, path, kind: 'memory'|'code', op: 'add'|'change'|'unlink', chunks_affected}`.
- Counters exposed on monitor (`http://localhost:4721/content-index`): files_indexed, chunks_indexed, vecs_in_index, last_change_at, watcher_refcount.

### 5.6 Memory write-ahead log (prior art pattern)

Every memory write (vault write, L1 insert, L2 embed, Kuzu node/edge, short-term → durable promotion) appends one JSON line to `{globalDataDir()}/db/wal/memory-writes-YYYY-MM-DD.jsonl` before the L0 vault write happens.

**Ordering invariant (safe-fix #5, security review F2):**

```
1. sanitizeOnWrite(content) -> sanitized_content
2. WAL append (records sha256(sanitized_content), never pre-sanitize body)
3. L0 vault write (sanitized_content)
4. L1 SQLite INSERT
5. L2 embedding (durable tier only)
6. Kuzu graph reducer emits node/edge updates
```

`sanitizeOnWrite` runs **first**. WAL records the post-sanitize body hash only. Any caller that bypasses this ordering violates the invariant. The WAL module accepts content only from the sanitizer's output, not raw caller input.

WAL record shape:

```json
{
  "ts": "2026-04-16T14:32:10.123Z",
  "op": "write_memory" | "promote" | "supersede" | "dreaming_delete" | "sanitize_redact",
  "memory_id": "...", "slug": "...",
  "kind": "...", "tier": "short_term" | "durable",
  "workspace_id": "...", "project_id": "...",
  "provenance": { "run_id": "...", "hook_point": "...", "context_type": "primary" },
  "content_sha256": "...",    -- body hash ONLY, never raw body (Rotation-4a redaction)
  "sanitize_events": [...]    -- what sanitizer did; see §6
}
```

**Rationale (per prior art):**
1. **Provenance defense.** Sanitize protects content; WAL protects "who wrote what, when." A later audit can answer "which run produced this memory" deterministically even if the memory itself was later superseded or deleted.
2. **Rollback.** `fulcrum memory rollback --since=TIME` replays the WAL backwards to undo a bad batch (e.g., a stuck heartbeat that leaked writes before §5 guard landed).
3. **Disaster recovery.** If the central DB is corrupt, the WAL + vault files can re-derive L1/L2 by re-ingest.

**Constraints:**
- Key-level redaction: record only `content_sha256` of the post-sanitize body (the body is already in L0 vault).
- Daily file rotation; old files compressed + retained 90 days; cleanup configurable.
- Written before L0 vault (same ordering invariant as AGENTS.md §"State entry must be written before the vault file rewrite" — except WAL is even earlier).
- WAL failure does NOT block the write; it logs an error and proceeds (prior art failure-isolation invariant).
- **Disaster-recovery is best-effort, not authoritative (safe-fix #5 clarification per adversarial-F5).** Because WAL append is fail-silent, recovery from WAL + vault may miss writes whose WAL line failed to flush. WAL's primary purpose is provenance defense + rollback — not strict event sourcing. Disaster recovery is a bonus affordance, not a guarantee.
- **Rollback authorization (safe-fix #7, security-F9).** `fulcrum memory rollback --since=TIME` is **operator-only**. NOT exposed via agent-callable `fulcrum action exec` surface. Requires explicit confirmation flag (`--yes-i-really-want-to-undo-N-writes`). Scoped to the current workspace by default; cross-workspace rollback requires an additional operator override. A compromised agent with shell access cannot trigger rollback through this command because the CLI action list does not expose it.

---

## 6. Sanitization + Fence (new `fulcrum-memory-sanitize` module)

Single library, single security perimeter. Lives in `fulcrum-memory` (owns L0/L1/L2 per AGENTS.md).

### `sanitizeOnWrite(content, meta) -> { content, events[] }`

Applied to every write path in §1. Composed of:

1. **Strip fence markers.** Remove any `<fulcrum-recall …>…</fulcrum-recall>` and the untrusted-context preamble. Prevents the feedback loop where injected recall is re-ingested as new memory (documented in the ideation doc as the primary risk vector).
2. **Prompt-injection detection.** Regex + heuristic match against common payload patterns (role hijack, instruction override, IGNORE_PREVIOUS, system-prompt spoof). Matches → emit `sanitize_event=injection_detected` and redact the offending block with `[…redacted: potential injection…]`. Matches prior art's security filter.
3. **Credential redaction.** Match AWS keys, GitHub tokens, generic high-entropy strings > N chars surrounded by recognizable prefixes. Replace with `[…redacted: credential…]`. Matches prior art `tools/memory_tool.py` docstring prohibition on "session-specific temporary paths, credentials, raw data dumps."
4. **Invisible-Unicode strip.** Remove BOM, zero-width joiners, bidi overrides. prior art verbatim: "invisible-Unicode patterns before write."

Errors never throw. Content is written as-is with a `sanitize_event=error` telemetry row. Memory errors must not block the tool/turn (prior art failure-isolation).

### `wrapForRecall(entries) -> string`

Produces the fence shown in §2.2. Applied by `recall_memory` tool on output. Agents pass the wrapped text into their reasoning; the fence tells them to treat contents as untrusted metadata.

---


---

**[← Index](index.md)** · **[← Prev: Data Model](04-data-model.md)** · **[Next: Hooks, Dreaming, Operations →](06-hooks-dreaming-operations.md)**
