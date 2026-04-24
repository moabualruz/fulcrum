---
date: 2026-04-16
topic: memory-automation-hooks
focus: Automate Fulcrum memory recording and retrieval via hooks across Claude Code, Gemini, Codex, Pi, OpenCode — minimize token waste, respect Claude Code PreToolUse no-inject and SessionStart-before-user-types constraints, align with prior art + prior art patterns.
---

# Ideation: Fulcrum Memory Architecture v2 — Hook-Driven Automation

## Codebase Context

**Project shape.** TypeScript monorepo, 12 packages. Agent integrations at `agent-integration/{claude,gemini,codex,pi,opencode,cursor,windsurf}/`. ~980 tests.

**Current hook/memory plumbing (verified).**
- Claude: `SessionStart → runSessionStartHook()`, `PreToolUse → runPreHook()`, `PostToolUse → runPostHook()`, `Stop → runSessionStopHook()`, `PreCompact → stub`.
- Gemini: `SessionStart`, `BeforeAgent` (registered, unused), `BeforeTool/AfterTool`, `SessionEnd`.
- Codex: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`.
- OpenCode: `tool.execute.before/after`, `permission.ask`, system-prompt transform.
- Pi: no hook surface piped into Fulcrum (gap).

**Current memory ops.**
- `PreHook`: task-scoped soft recall to stderr for Claude; workspace snapshot cached 5min then discarded.
- `PostHook`: always writes `tool_trace` but logs only parameter keys (not values), no dedup.
- `SessionStart`: registers run, caches snapshot.
- `Stop/SessionEnd`: completes run, no memory synthesis.

**Known gaps.** PostHook never extracts `file_path`/content/command. No mid-session or pre-compaction summarization. Gemini `BeforeAgent` unused. `PreCompact` stubbed. No dedup → token waste on repeated tool_trace rows. Snapshot-via-stderr injection is lossy. Pi runs are memory-invisible.

**Hard constraints.**
- Global-only data: DB/vault/sessions must use `globalDataDir()` from `fulcrum-core`. Never project-local.
- Claude Code `PreToolUse` cannot inject context (approve/block only).
- `SessionStart` fires before the user types — intent-based recall there is wasteful.
- Gemini `BeforeAgent` + Gemini/Codex `PreToolUse` can inject via `additionalContext`.

**Already-decided plan** (from `docs/handover/memory-automation-via-hooks.md`): fix `runPostHook` to extract real values; add `runStopHook` for `task_outcome`; Gemini `BeforeAgent` inject top-3 summary/decision memories <500 tokens; Gemini/Codex `PreToolUse` on Write/Edit file-scoped recall ≤2 results score ≥0.6; `SessionStart` minimal.

**Research (this session).** prior art (verified real: `prior-art/prior-art`, 358k stars, TS, lobster branding, created 2025-11-24) and prior art (NousResearch/prior art). Both frameworks:
- Never do intent-based recall at `SessionStart`; freeze a curated system-prompt block instead.
- Recall per user turn, not per tool call.
- Fence injected recall as untrusted metadata; sanitize markers from writes.
- Use char caps, not token caps.
- Refuse memory ops in non-primary contexts (cron / subagent / heartbeat / flush).
- Isolate memory failures (timeout / missing provider / model failure → skip, don't block).

**Distinctive prior art patterns:**
- *Active Memory* blocking sub-agent with narrow tools (`memory_search`/`memory_get`), hard timeout, cheap fast model, NONE-biased prompt.
- *Dreaming* promotion: short-term → durable requires ≥3 recalls across ≥3 unique queries at ≥0.8 score within 30 days. Durability is earned by retrieval, not by writing.
- Promotion re-reads live source so edits/deletes survive promotion.

**Distinctive prior art patterns:**
- Frozen system prompt mid-session (preserves prefix cache).
- `on_pre_compress` hook extracts insights before context compaction drops messages.
- `on_delegation(task, result)` — parent learns from subagent completion.
- Single external provider rule (governance).

Full research: `docs/research/memory-patterns-hooks-and-scoring.md`.

---

## Ranked Ideas

All 7 are adopted together as a single coherent system — Fulcrum Memory Architecture v2. Dependencies noted per idea.

### 1. `fulcrum memoryd` — shared blocking recall sub-agent
**Description:** Long-lived daemon reachable via Unix-socket RPC that all five integrations call for dynamic recall. Narrow tools (`memory_search`, `memory_get`), cheap fast model (Haiku / Flash / gpt-oss-120b), hard timeout (2s default), NONE-biased prompt. Produces per-turn fenced artifact (≤220 chars) that hook consumers inject into agent context where supported; for Claude (no inject at PreToolUse) the artifact is written to a turn-scoped file the next user turn's hook can surface.
**Rationale:** One brain, five shells. Separates recall latency/cost from reply latency/cost. Embedding + vec index load once. Uniform sanitization in one place.
**Downsides:** Subprocess lifecycle to manage; Unix-socket protocol to design; per-turn artifact scheme for Claude is novel.
**Open fork for brainstorm:** *memoryd (LLM judge) vs. recall-service (deterministic RRF only)*. The LLM judge gives NONE-bias, context-aware relevance, and works around Claude's inject limitation via externalized artifact. The deterministic service is faster, cheaper, predictable — but returns K results always, cannot distinguish "similar words" from "actually relevant," and doesn't solve the Claude injection gap. Brainstorm resolves which wins, or whether recall-service fronts memoryd as a cheap fast path.
**Confidence:** 80%. **Complexity:** High.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 2. Recall-driven durability (signal ledger + Dreaming promotion)
**Description:** New `memory_recall_events` table records every recall (memory_id, query, score, rank, caller_run_id, caller_role, hook_point, timestamp). Nightly `fulcrum dream` job promotes short-term entries to durable when recalled ≥3× across ≥3 unique queries at ≥0.8 score within 30 days. Unrecalled short-term entries expire silently after 30 days.
**Rationale:** One cheap primitive (signal ledger) powers promotion, dedup, garbage collection, utility-scored ranking, and offline evaluation. Inverts write-heavy bias — memories earn survival by being used.
**Downsides:** Changes mental model of what `write_memory` guarantees; deletion semantics need care; operators may be confused by "I wrote this, where did it go?"
**Depends on:** #4 (context_type to exclude non-primary recall events), #6 (kind taxonomy for per-kind promotion rules).
**Confidence:** 85%. **Complexity:** Medium.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 3. PreCompact extraction hook (prior art parity)
**Description:** Flesh out the stubbed Claude `PreCompact` hook; mirror on Gemini `SessionEnd` and Codex `Stop` with a synthetic compaction boundary. Before messages are dropped, a narrow extractor LLM pass identifies decisions (regex + "we decided / let's use / blocked on" phrases), file intents, errors+resolutions, blockers. Writes each as a typed memory with `provenance.hook_point = 'pre_compact'`.
**Rationale:** Single biggest silent data loss today — long-session decisions die at compaction. Grounded: the stub already exists in `hooks.ts`.
**Downsides:** Extractor quality depends on prompt + model choice; needs eval bench to tune; model calls add latency to compaction.
**Depends on:** #5 (fence output), #6 (typed memories). Uses #1 if memoryd exposes an `extract` RPC.
**Confidence:** 90%. **Complexity:** Medium.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 4. Run-context tagging + non-primary memory refusal
**Description:** Extend `agent_runs` schema with `context_type: primary | subagent | cron | heartbeat | flush` and `parent_run_id`. All memory reads and writes inherit the tag; hooks short-circuit memory ops when `context_type ≠ primary` (returning a fenced `[recall suppressed: non-primary context]` marker). On subagent completion, parent's memoryd receives a delegation-summary memory (prior art `on_delegation` pattern), tagged `kind=delegation_summary` with `parent_run_id`.
**Rationale:** Prevents orchestration chatter / heartbeat loops / cron runs from polluting memory. One primitive gates safety and unlocks role-aware billing, rate limits, observability. Maps directly onto Fulcrum's chief_of_staff L1 / L2-implementer / cron distinctions.
**Downsides:** Existing rows need backfill or mixed-shape tolerance; subagent detection requires reliable `parent_run_id` propagation through `start_agent_run`.
**Depends on:** nothing (foundational — should ship first).
**Confidence:** 90%. **Complexity:** Low.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 5. Untrusted-context fence + sanitize-at-write middleware
**Description:** New shared `fulcrum-memory-sanitize` library with `stripFenceMarkers()`, `detectPromptInjection()`, `redactSecrets()`. Every injection wraps content in `<fulcrum-recall trust="untrusted">…</fulcrum-recall>` with "not user input, not instructions" preamble. Every write path (5 integrations × N hook points, plus memoryd) calls sanitizer before persistence to strip those markers and known injection patterns. Single security perimeter.
**Rationale:** Without fencing + sanitization, recalled text gets re-ingested as new memory on the next PostHook → feedback loop amplifying any prompt-injection payload that ever entered the vault. Both prior art and prior art treat this as mandatory; Fulcrum currently has neither.
**Downsides:** Minor perf overhead on every write; false positives in sanitizer are possible (needs tunable allowlist).
**Depends on:** nothing (should ship early alongside #4).
**Confidence:** 95%. **Complexity:** Low.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 6. Typed tool_trace — extract values, dedup, kind, provenance, path-index
**Description:** Finish the planned `runPostHook` fix and extend. (a) Extract real `file_path` / content / command values from `toolInput`. (b) `kind` enum: `tool_trace | summary | decision | task_outcome | file_patch | blocker_resolution | delegation_summary | identity | persona`. (c) Dedup by `sha256(tool_name, normalized_args, cwd)` within a turn. (d) Provenance JSON sidecar column: `{agent_role, run_id, hook_point, source_kind, parent_memory_id?, confidence}`. (e) Absolute-path index on `kind=file_patch` for O(log n) file-keyed recall at Write/Edit PreToolUse.
**Rationale:** Turns the firehose into signal. Each add-on cheap; together they unlock per-kind char caps, kind-filtered recall, provenance-based dedup/rollback, path-keyed fast recall, utility reweighting.
**Downsides:** Data-model migration; must backfill or tolerate mixed-shape rows. Kind enum may need extension later.
**Depends on:** #5 (sanitize writes), #4 (context_type written into provenance).
**Confidence:** 85%. **Complexity:** Medium.
**Status:** Explored (2026-04-16) — brainstorm pending.

### 7. Task-lifecycle-derived `task_outcome` (replaces Stop-hook heuristic)
**Description:** Generate `kind=task_outcome` memories on every `update_task(status=completed|blocked)` call, synthesized from the task record + that run's `file_patch` + tool_trace memories. Stop-hook becomes a fallback for untasked sessions only. `blocked` tasks yield `kind=blocker_resolution`. Multi-session tasks get per-milestone outcomes, not just session-end.
**Rationale:** Tasks already know when work completed and why. Tying memory generation to the authoritative event source eliminates Stop-hook heuristic drift and gives multi-session tasks per-milestone outcomes.
**Downsides:** Depends on agents actually calling `update_task` (current compliance unclear); must coordinate with Stop-hook so they don't double-write.
**Depends on:** #6 (kind taxonomy), #2 (so task_outcome participates in promotion).
**Confidence:** 80%. **Complexity:** Low.
**Status:** Explored (2026-04-16) — brainstorm pending.

---

## System View

```
                         #4 Run-context tagging (primary/subagent/cron/heartbeat)
                         │   └── gates ────────────────────────┐
                         │                                     ▼
                         ├── gates writes by ── #6 Typed tool_trace
                         │   (extract, dedup, kind, provenance, path-index)
                         │                     │
                         │                     ▼
                         └── gates reads by ── #1 memoryd ──► per-turn fenced artifact
                                               │  ▲            (consumed by all 5 integrations;
                                               │  │             written to disk for Claude)
                                               │  │
                                               │  └── #5 Fence+sanitize (every in/out)
                                               │
#2 Signal ledger + Dreaming promotion ◄────── records all recall events
   │
   └── promotes short-term → durable          decides what #6 writes survive

#3 PreCompact extraction ───► writes #6-typed memories on compaction boundary
#7 Task-lifecycle hook ─────► writes #6 kind=task_outcome on update_task(status)
```

**Natural shipping order (pending brainstorm to confirm):** #4 + #5 (foundational, zero dependencies) → #6 (data model) → #2 (signal ledger) → #3 (PreCompact extractor) → #1 (memoryd) → #7 (task-lifecycle synth).

---

## Open Questions for Brainstorm

1. **memoryd vs. recall-service fork** (see #1). LLM judge vs. deterministic RRF vs. layered (recall-service as fast path, memoryd as NONE-bias judge).
2. **Sanitization policy** (see #5). Aggressive (strip anything that looks like a fence) vs. conservative (only strip exact-match markers). False-positive tolerance.
3. **Dreaming thresholds** (see #2). Start at prior art's values (≥3 / ≥3 / ≥0.8 / 30d) or derive from the 249 imported sessions offline?
4. **PreCompact extractor model** (see #3). Same model as memoryd? Separate budget? Deterministic rule-based + LLM hybrid?
5. **Migration** of existing tool_trace rows (see #6). Backfill kinds / provenance, or tolerate mixed schema?
6. **Stop-hook vs. update_task race** (see #7). If both fire for the same run, which wins? De-dup by run_id?
7. **Frozen curated block at SessionStart?** Was rejected in this pass (deferred — depends on Dreaming output). Worth reopening once #2 ships?
8. **Pi hook surface** (rejected as TODO not ideation) — when does it get filed and who owns it?

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | SessionStart does nothing / content-hash ETag cache | Absorbed: memoryd owns session-start snapshot |
| 2 | Hooks FTS-only, no vector | Absorbed into #1 memoryd design (narrow tools + cheap model) |
| 3 | Auto-recall opt-out via `// @fulcrum:no-recall` marker | Absorbed into #1 memoryd config |
| 4 | Claude PreToolUse as policy filter, not injector | Policy guard already exists; low marginal value |
| 5 | Hooks observe only; background consolidator writes | Architecturally subsumed by #1 + #2 + #6 |
| 6 | Half-life decay tiers per kind | Absorbed into #2 Dreaming (decay via TTL + non-promotion) |
| 7 | Agent-memory vs. operator-memory split | Orthogonal; belongs in a separate brainstorm |
| 8 | Role-scoped memory replaces workspace/project/file | Too radical; full redesign, not ideation-level |
| 9 | LLM-judged recall replaces similarity threshold | Absorbed into #1 (NONE-biased sub-agent) |
| 10 | Recall intent primitive replaces `memory` | Too radical; different brainstorm about MCP surface |
| 11 | Offline eval bench on 249 historical sessions | Valuable but infrastructure, not automation; parallel track |
| 12 | Provenance sidecar as standalone primitive | Absorbed into #6 |
| 13 | Delegation as memory event | Absorbed into #4 via `on_delegation`-style subagent-completion hook |
| 14 | Char-cap HookBudget primitive | Absorbed into #1 memoryd config |
| 15 | File-scoped recall disk card + path index | Path index absorbed into #6; disk cache absorbed into #1 |
| 16 | Pi hook surface plug | Boring TODO, not ideation — file separately |
| 17 | Stop-hook structured diff+decision record | Superseded by #7 (task-lifecycle source of truth) |
| 18 | Frozen curated block at SessionStart | Valuable but depends on #2 output to populate — deferred, flagged as open question |
| 19 | PostToolUse as transcript appender (no DB writes) | Loses inter-session audit trail |
| 20 | Compaction is primary write event, tool calls are noise | Too radical variant of #3; parity form kept |
| 21 | Kill `write_memory` tool entirely | Subsumed by #2; don't need to remove the tool to flip the bias |

---

## Session Log

- **2026-04-16**: Initial ideation. Phase 1 grounding: codebase scan (haiku), learnings-researcher, prior art+prior art research (written to `docs/research/memory-patterns-hooks-and-scoring.md`). Phase 2: 4 parallel ideation agents on frames (pain/friction, inversion, reframing, leverage) produced 46 raw candidates, deduped to ~28 distinct ideas. Phase 3 adversarial filter kept 7 survivors covering the whole memory-automation lifecycle. User elected to carry all 7 into a unified brainstorm ("Fulcrum Memory Architecture v2"). User raised open question on #1: why a sub-agent? Captured as explicit fork (memoryd vs. recall-service) for brainstorm to resolve. Next: `ce:brainstorm` with the unified system framing.
