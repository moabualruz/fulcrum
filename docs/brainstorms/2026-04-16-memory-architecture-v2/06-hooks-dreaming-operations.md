---
date: 2026-04-16
topic: memory-architecture-v2
part: "06"
title: Hooks, Dreaming, Race Conditions, Migration
index: index.md
prev: 05-safety-watcher-wal.md
next: 07-acceptance-and-planning.md
---

# Memory Architecture v2 — 06 — Hooks, Dreaming, Race Conditions, Migration

**[← Index](index.md)** · **[← Prev: Safety, Watcher, WAL](05-safety-watcher-wal.md)** · **[Next: Acceptance & Planning →](07-acceptance-and-planning.md)**

## 7. Per-Agent Hook Wiring (final state)

| Agent | SessionStart | BeforeAgent / equivalent | PreToolUse | PostToolUse | PreCompact | Stop / SessionEnd |
|---|---|---|---|---|---|---|
| Claude | run register + context_type | n/a | policy + secret scan only | write `file_patch` / `bash_trace` via §1 | **NEW: extractor → `pre_compact_extract` writes** | run complete + `session_summary` fallback |
| Gemini | run register + context_type | **deleted (was unused stub)** | policy only | §1 writes | synthetic boundary via SessionEnd | run complete + `session_summary` fallback |
| Codex | run register + context_type | n/a | policy | §1 writes | synthetic boundary via Stop | run complete + `session_summary` fallback |
| OpenCode | via `tool.execute.before` policy | n/a | policy | §1 writes via `tool.execute.after` | n/a (no compaction hook) | via run complete |
| Pi | **NEW: wire hooks** | n/a | policy | §1 writes | n/a | run complete |

**Gemini `BeforeAgent` stub (safe-fix #2 clarification per coherence #5).** The `BeforeAgent` entry in `agent-integration/gemini/hooks/hooks.json` was *registered* but never *wired* to a handler — it has always been a no-op. "Delete" here means removing the config entry as cleanup; there is no implementation to tear down and no semantic change at runtime. The config-entry deletion is tracked as a one-line task in PR 6 (the hook writes rewrite).

**Pi hook surface is new.** Currently Pi dispatches are memory-invisible per the ideation codebase scan. Phase 2 wires Pi's pre/post points into the same `runPreHook` / `runPostHook` surface as Codex, uses `context_type='primary'` when Pi is the user-facing runtime, `'subagent'` when Pi is spawned by chief_of_staff.

---

## 8. Dreaming (prior art + Karpathy ingest/lint/consolidate)

New binary: `fulcrum dream [--phase={light|REM|deep}]`. Default runs all three phases in sequence. Designed for cron install (default: `0 3 * * *`). Plays Karpathy's "wiki maintainer" role across the short-term vault.

**Light phase (ingest + lint).** Opens the short-term vault as a wiki. Maintains:

- `short_term/index.md` — catalog of pages by kind/tag/date, one-line summaries.
- `short_term/log.md` — append-only chronological record of writes.
- Backlinks — resolves dangling `memory_wikilinks.dst_memory_id`; reports unresolvable as dangling.
- Contradiction scan — sibling pages with same tags/entities but conflicting claims flagged.
- Stale-claim scan — entries older than TTL with zero recalls flagged for eviction.
- Orphan scan — entries with zero inbound wikilinks AND zero recalls flagged.

Writes report to `{globalDataDir()}/memory/dreaming/light/YYYY-MM-DD.md`. No durable writes; no deletions (deletions happen in deep phase).

**REM phase (consolidate).** Clusters short-term entries by topic using the L1 FTS similarity (cheap — still no embedding). Extracts entities + relationships for the Kuzu graph (people, files, decisions, errors, patterns). Writes themes to `{globalDataDir()}/memory/dreaming/REM/YYYY-MM-DD.md` and a `dreams.md` page linking to the themes. Prepares promotion candidates but does not promote.

**Deep phase (promote).** Only phase that writes to durable. Eligibility (prior art defaults, §12 tuning TODO):

- `max_recall_score ≥ 0.75`
- `recall_count ≥ 3`
- `unique_query_count ≥ 2`
- `age ≤ 30 days` with half-life 14 days
- `context_type = 'primary'` on the originating run
- Not already `durable`

Thresholds reconciled with source inventory B.4 (which is the prior art verbatim port source: `prior-art/extensions/memory-core/src/short-term-promotion.ts:1168-1307`). Prior v10 wording (`≥0.8 / ≥3 / ≥3`) was internally inconsistent with the port source; safe-fix #1 resolves to the verbatim set. Review note adversarial-F3 flagged that low promotion rates are a real risk on code-agent workloads — §12.2's offline sweep on 249 imported sessions validates these thresholds before Dreaming cron ships.

On promotion, per candidate:

1. **Re-read live source** (prior art "never promote from stale snapshot"). User edits / deletions to the short-term vault file since the last signal win.
1a. **Re-sanitize at promotion boundary.** Before any durable write, candidate content runs through `sanitizeOnWrite()` a second time with stricter config (rejection, not redaction, on prompt-injection matches). Rationale: durable entries land in native host MEMORY.md files and become implicit system context *outside* the `<fulcrum-recall>` fence. Anything that survived 30 days of short-term tier must re-prove it is safe to cross the trust boundary. A candidate that fails re-sanitization is dropped from promotion with a telemetry event; short-term row is kept for operator review, not deleted. (Review finding security-F5.)
2. **Supersession detection.** If a durable memory with matching entity / topic already exists and the new candidate contradicts or refines it, set `supersedes: [old_id]` on the new durable entry and mark the old as replaced (do not delete — keep version history).
3. **Write durable memory** via `fulcrum-memory` standard path: L0 vault file under `durable/<kind>/<slug>.md` → L1 row (upsert with `tier='durable'`, `embedded=1`) → **L2 embedding + Kuzu graph node/edge population**.
4. **Append** a one-line entry to the user's native project-context file (Claude: `~/.claude/projects/<slug>/memory/MEMORY.md`; others: `AGENTS.md` under `## Memory — promoted`).
5. **Delete** the short-term row + vault file (durable is canonical after promotion).

Expired unpromoted short-term entries (>30d, never met thresholds) are deleted silently with an entry in `log.md`.

### 8.1 Kuzu graph population — unified memory + code + control-plane

Per AGENTS.md §"Package Ownership Boundaries", `fulcrum-memory` owns the Kuzu graph. Existing SQLite tables `graph_entities`, `graph_edges`, `graph_episodes` are the Kuzu-shaped scaffolding; v2 populates them from event streams rather than leaving them empty. The graph unifies memory, PCI, AND the full control plane (§1.3) in one store; this is the substrate `code_context`, `recall_memory`, and `project_context` traverse.

**Node types — grouped by source table.**

| Group | Node kinds | Source table(s) |
|---|---|---|
| Memory | `decision`, `task_outcome`, `blocker_resolution`, `file_patch`, `identity`, `persona`, `session_summary`, `pre_compact_extract`, `delegation_summary` | `memories` |
| Code | `file`, `module`, `class`, `function`, `method`, `symbol` | `code_chunks`, `code_files`, `code_symbols` |
| Control plane | `workspace`, `project`, `task`, `agent_run`, `team_instance`, `team_template`, `workflow_run`, `handoff`, `artifact`, `review`, `worktree` | `workspaces`, `projects`, `tasks`, `agent_runs`, `team_instances`, `team_templates`, `workflow_runs`, `handoffs`, `artifacts`, `reviews`, `worktrees` |
| Planning | `epic`, `issue`, `prd`, `plan` | `epics`, `issues`, `prds`, `plans` |
| Event | `hook_event`, `trace_event` (ephemeral; pruned after Dreaming REM extracts insights) | `hook_events`, `trace_events`, `run_events` |
| Shared | `entity` (generic — people, libraries, services, external systems) | `memory_entities` |

**Edge types.**

| Category | Edges | Example |
|---|---|---|
| Memory↔memory | `supersedes`, `contradicts`, `resolved_by`, `delegated_to` | decision A supersedes decision B |
| Code↔code | `imports`, `calls`, `extends`, `defines`, `contained_in` | function F calls function G |
| Memory↔code | `edits`, `about`, `caused_by`, `mentions` | file_patch edits file; decision about function |
| Task↔everything | `assigned_to` (task→run), `blocked_by` (task→task), `delivered_by` (task→artifact), `depends_on` (task→task), `has_outcome` (task→memory) | task X delivered_by artifact Y |
| Run↔everything | `produced` (run→memory), `edited` (run→file), `handled` (run→handoff), `part_of` (run→team_instance), `hit` (run→hook_event) | run R1 produced decision D1 |
| Team↔everything | `instantiated_from` (team_instance→team_template), `executed_by` (team_instance→run), `invoked_by` (team_instance→run caller) | team T ran run R1 |
| Workflow↔everything | `defines` (workflow→step), `ran_as` (workflow_run→workflow), `triggered_by` (workflow_run→event) | workflow W ran_as workflow_run WR5 |
| Planning↔control | `implements` (task→issue), `derived_from` (plan→prd), `tracks` (epic→issues) | task T2 implements issue #142 |
| Artifact↔everything | `produced_by` (artifact→run), `reviewed_by` (artifact→review), `referenced_in` (artifact→memory) | artifact A produced_by run R |

**Who populates each.**

| Population path | Trigger | Writer |
|---|---|---|
| Code nodes + code↔code edges | PCI watcher `add`/`change`/`unlink` (§5.5.3) | `fulcrum-memory` ingest pipeline, synchronous part of chunk write |
| Memory nodes + memory↔code edges | Memory write (hook or `write_memory`) → L0 → L1 → L2 | `fulcrum-memory/write.ts`, Kuzu node created in L2 step |
| Control-plane nodes | `start_agent_run` / `create_task` / `invoke_team` / `complete_agent_run` / `update_task` etc. | `fulcrum-core` domain functions emit an event; graph reducer upserts the node |
| Control-plane edges (assigned_to, part_of, produced, delivered, triggered, hit, etc.) | Same domain functions | Graph reducer — one small function per edge type reading the event stream |
| Memory↔memory cross-edges (supersedes, resolved_by, delegated_to) | Dreaming deep phase (supersedes) + `on_delegation` (delegated_to) + explicit via `write_memory` (resolved_by) | Dreaming + hooks |
| Memory↔code cross-edges (mentions) | Dreaming REM phase scans new short-term memory for wikilinks + file_paths frontmatter | `fulcrum dream --phase=REM` |
| Entity extraction (people/libs/APIs) | Dreaming REM phase — NLP-light over body text | Same |
| Event pruning | Dreaming light phase — hook_event/trace_event nodes older than 7 days with no inbound edges are pruned | Same |

**Graph reducer pattern (new).** Each edge type has a small pure function: `(event) → UpsertNode[] | UpsertEdge[]`. The reducer runs in-process on the event bus (`fulcrum-core/event-bus.ts`) and batches writes to Kuzu. Errors are logged; never block the domain function that emitted the event (prior art failure-isolation invariant).

**Four tools that traverse the unified graph:**
- `recall_memory` — FTS + vec + graph-traversal fused via RRF over memory nodes (durable tier only).
- `query_memory` — short-term wiki: FTS + wikilinks + tags on memory nodes (short-term tier).
- `search_code` — FTS + vec + symbol-exact over code nodes.
- `code_context` — graph traversal from a seed code node, including cross-type edges into memory.
- `project_context` (§2.6) — multi-seed bundle across all node types. Primary orientation tool for agents starting work.

This is how `"what tasks are blocked on this file, and what decisions governed the last changes?"` returns a coherent answer: graph traversal `File ←(edits)← FilePatch ←(produced)← AgentRun ←(assigned_to)← Task` + `Decision →(about)→ File`.

### 8.3 Global pointer collection (prior art "closet" pattern)

REM phase also materializes a small compact index for cheap `scope: 'global'` probing:

```
{globalDataDir()}/memory/dreaming/global_index.md
```

Each line:
```
topic | entities | kind | memory_slug | workspace_id/project_id | score
```

Populated from durable memories across ALL workspaces (subject to §12.12 policy). Max ~2000 lines; oldest + lowest-utility pruned. Purpose: `recall_memory(scope: 'global', query: 'X')` first probes this index (FTS5 on the `topic | entities` columns) to cheaply eliminate no-match queries. Only queries with ≥1 hit in the pointer collection fan out to full FTS + vec + graph across all projects. Keeps global-scope latency bounded.

Inspired by prior art's "closet" pattern for wide-scope matching — a small pre-filter before expensive global recall.

### 8.2 Procedural-memory proposal pipeline

When Dreaming detects a recurring pattern (e.g., a sequence of decisions + file_patches that form a repeatable procedure), REM writes a proposal to `{globalDataDir()}/memory/dreaming/proposed_skills/<slug>.md`. Proposals are for human review — they do not automatically become real skill files. This is Rohit's "consolidation into procedural memory" made explicit and gated.

---

## 9. Race Conditions and Resolution

**`update_task` vs. Stop-hook.** Stop hook inspects `memories` table for rows with `provenance.run_id = current_run_id AND kind IN ('task_outcome','blocker_resolution')`. If present → skip `session_summary` write. Else → write `session_summary`. Stable: `update_task` fires synchronously from the tool call; Stop fires only after the turn completes.

**Concurrent `update_task` calls for the same task.** Last write wins. `task_outcome` rows carry `(task_id, status, run_id, created_at)` so dedup by `(task_id, status)` picks the most recent.

**Dreaming running while writes land.** Deep phase reads short-term rows in a single transaction; new writes during the read are picked up on the next run. No locking needed.

**Non-primary run writes.** Dropped silently with telemetry per §5. Never throws.

---

## 10. Migration + Rollout

**Big-bang behind a feature flag** (`FULCRUM_MEMORY_V2=1`).

- Schema additions (§3) land in one migration. Old rows keep NULL `kind`, `tier`, `provenance`; `recall_memory` continues to return them untyped. No data migration.
- New write paths run only when flag is on. Flag-off path preserves current behavior exactly.
- Dreaming cron is opt-in per install (operator runs `fulcrum dream --install` to add the crontab entry).
- Sanitization runs even when flag is off (defense-in-depth for existing writes).
- Context-type guards run even when flag is off (safety primitive).

**Rollback.** `FULCRUM_MEMORY_V2=0` reverts behavior. Short-term rows accumulated under v2 remain queryable and are eligible for future re-enable.

---


---

**[← Index](index.md)** · **[← Prev: Safety, Watcher, WAL](05-safety-watcher-wal.md)** · **[Next: Acceptance & Planning →](07-acceptance-and-planning.md)**
