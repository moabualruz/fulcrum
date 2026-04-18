# Memory v3 — Progress Ledger

Append-only. Every unit of work gets one entry. The reusable prompt at `2026-04-18-002-memory-tiered-architecture-prompt.md` reads the last entry to find the resume point.

## Entry format

```
### YYYY-MM-DD HH:MM — PR {N} unit {N.M} — {status}
- Skills invoked: <list>
- Summary: <one line>
- Commit: <sha>
- Next: <planned next unit>
- Notes: <optional blockers, deviations, follow-ups>
```

Status values: `in_progress`, `completed`, `blocked`, `deferred`, `rolled_back`.

**Rules:**
- Never edit a past entry; append a new one with updated status if something changes.
- `in_progress` entries must be followed by `completed` or `blocked` before a new unit starts.
- Skill list must match what was actually invoked (auditable).
- `Commit` is the primary work commit for the unit (not the ledger-update commit).

---

## Log

### 2026-04-18 15:00 — PR 0 unit 0.1 — completed
- Skills invoked: agent-skills:spec-driven-development, agent-skills:planning-and-task-breakdown, elements-of-style:writing-clearly-and-concisely, WebSearch (for curator model research)
- Summary: Plan document `2026-04-18-002-memory-tiered-architecture-plan.md` committed to `docs/plans/`.
- Commit: 0a01aff (initial), bf29f10 (model pinning), 6896578 (templates + traceability), 6e859ff (skill matrix + test corpus)
- Next: PR 0 unit 0.2 — migration SQL `2026-04-19-001-memory-v3-lifecycle.sql`
- Notes: Plan is 930 lines. Approval checklist fully green. Awaiting user go-ahead to start PR 0 unit 0.2.

### 2026-04-18 18:40 — PR 0 unit 0.2 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:test-driven-development, agent-skills:incremental-implementation, agent-skills:source-driven-development (repo-archaeology on migration conventions), agent-skills:code-review-and-quality (self-review), andrej-karpathy-skills:karpathy-guidelines, episodic-memory:remembering-conversations, agent-skills:documentation-and-adrs (Knowledge-graph ADR block), compound-engineering:git-commit
- Summary: `runMigration101MemoryV3Lifecycle` landed in `packages/memory/src/schema.ts` with 10 passing vitest cases and re-export from the package barrel. Plan updated with the Knowledge-graph ADR, full l0_sources DDL, and l1_pages view DDL (working-tree only per feedback_never_commit_docs).
- Commit: 9384555 (code only: schema.ts + index.ts + schema-v3.test.ts; +338 lines)
- Next: PR 0 unit 0.3 — `runMigration102MemoryV3SourceIndex` (indexes on the new columns; same file)
- Notes: Four Q2/Q3/Q4 ambiguities in the plan were resolved before work started (extend graph_entities/edges in place, treat l1_pages as a VIEW over memories, full DDL shapes) and the plan was rewritten to reflect those decisions. Plan/ledger edits intentionally uncommitted (CLAUDE.md memory `feedback_never_commit_docs`). Working tree also carries pre-existing unrelated changes from other tasks (agent-integration/, packages/core/janitor.ts, worktree-ops, etc.) that were left untouched.

### 2026-04-18 18:51 — PR 0 unit 0.3 — completed
- Skills invoked: agent-skills:test-driven-development, agent-skills:incremental-implementation, agent-skills:code-review-and-quality, andrej-karpathy-skills:karpathy-guidelines, compound-engineering:git-commit
- Summary: `runMigration102MemoryV3SourceIndex` added to `packages/memory/src/schema.ts` — 11 indexes across `l0_sources` (5), `memories` (3 partial), `graph_entities` (2, one partial), `graph_edges` (1). All `CREATE INDEX IF NOT EXISTS`; ledger row `102_memory_v3_source_index`; 5 new vitest cases (`sqlite_master.sql` assertions verify partial WHERE clauses).
- Commit: 82a8361 (code only: schema.ts + index.ts + schema-v3.test.ts; +136 -2)
- Next: PR 0 unit 0.4 — `packages/memory/src/l0/types.ts` (TypeScript types only, no runtime code)
- Notes: fulcrum-memory suite now 645 tests (was 640). Full `pnpm -r build` clean. Same doc-commit discipline observed (plan/ledger edits remain working-tree only).

### 2026-04-18 18:57 — PR 0 unit 0.4 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:api-and-interface-design (L0 ingest contract shape), andrej-karpathy-skills:karpathy-guidelines (no runtime logic added), compound-engineering:git-commit
- Summary: New `packages/memory/src/l0/types.ts` declares `L0_SOURCE_TYPES` const tuple, `L0SourceType` union, `L0Frontmatter`, `L0File`, `L0IngestInput`, `L0IngestMeta`, `L0SourceRow`. Types match the plan's §L0 frontmatter spec and the `l0_sources` columns 1:1.
- Commit: 5a38ff8 (+112 insertions, net-new file)
- Next: PR 0 unit 0.5 — update `AGENTS.md` + `agent-integration/claude/CLAUDE.md` with a "Memory tiers (v3 draft)" section
- Notes: Not yet barrel-exported (PR 1 picks the public surface). Build + 645 tests still green.

### 2026-04-18 19:03 — PR 0 unit 0.5 — completed
- Skills invoked: agent-skills:documentation-and-adrs, elements-of-style:writing-clearly-and-concisely, compound-engineering:git-commit
- Summary: "Memory Tiers (v3 draft)" section added to `AGENTS.md` (after Memory System Patterns) and `agent-integration/claude/CLAUDE.md` (after Role Boundaries). Both sections point to the full plan, explain the L0/L1/L2 split, feature-flag status, graph-column mapping, and migration mechanics. CLAUDE.md variant is slightly terser and agent-action-focused ("keep using v2a surface until PR 1 flips L0 writes").
- Commit: 368f9eb (+63 insertions across 2 files)
- Next: PR 0 DONE — hand off to user for review before starting PR 1. PR 1 unit 1.1 is the first runtime wiring: `l0/ingest.ts` → `ingestRawSource` calls `runMigration101/102` at startup + writes to `vault/raw/` + inserts into `l0_sources`.
- Notes: Had to stash pre-existing unrelated CLAUDE.md changes (24-tool-count regen + sweep_stale_runs entry) before editing so my commit stayed surgical; popped cleanly after commit, no conflicts. PR 0 totals: 4 commits (9384555, 82a8361, 5a38ff8, 368f9eb), ~513 lines added across code + docs, 0 regressions, fulcrum-memory suite 645/645. Stopping per STOP CONDITIONS — end of PR hand-off.

### 2026-04-18 21:30 — PR 1 — COMPLETE (all 5 units shipped)
- Skills invoked across all units: agent-skills:context-engineering, agent-skills:test-driven-development, agent-skills:incremental-implementation, agent-skills:api-and-interface-design, agent-skills:security-and-hardening, agent-skills:source-driven-development (repo archaeology — FulcrumEventBus, newId, ContentChangeKind, WAL API, hook structure), andrej-karpathy-skills:karpathy-guidelines, compound-engineering:git-commit.
- Units shipped:
  - 1.1 `ingestRawSource` — commit 2c04179 (+434, 5 files)
  - 1.2 `writeRawFile` + `writeCuratedFile` — commit 20e9af7 (+132/-10, 4 files)
  - 1.3 vault watcher `l0_raw` + `l1_curated` events — commit 88328f6 (+172/-7, 3 files)
  - 1.4 hook `FULCRUM_MEMORY_V3` branch (file_patch + bash_trace verbatim) — commit 6743f69 (+77/-27, 2 files)
  - 1.5 regression tests (10 KB verbatim, WAL round-trip, v2a parity) — commit 6db30ab (+118, 1 file)
- PR 1 totals: 5 commits, +933/-44 lines, 0 regressions. fulcrum-memory 672/672 (was 645 at PR 1 start — 27 new tests), fulcrum-agent-cli 379/379, fulcrum-agent-core 574/574, full `pnpm -r build` clean.
- Self-init pattern: `ensureV3SchemaApplied()` in `ingestRawSource` runs `runMigration101MemoryV3Lifecycle(db)` once per DB handle (WeakSet tracking) so hook callers don't need to pre-apply the migration. Idempotent via existing PRAGMA table_info guards.
- Review-finding compliance: reused existing `FulcrumEventBus` (review C1) — `EventType` gains `'l0_ingested'`; `ContentChangeKind` gains `'l0_raw'|'l1_curated'`. No new per-subsystem bus.
- Next: PR 2 — L1 templates + page primitives + validator. Before PR 2: decide Open Question #2 (validator library — ajv vs zod vs typebox) per MASTER-PLAN guidance.
- Notes: Flag `FULCRUM_MEMORY_V3` stays default-off. v2a `writeMemory` remains the primary path until PR 5 cutover. Same doc-commit discipline observed (plan/ledger edits working-tree only per feedback_never_commit_docs).

### 2026-04-18 21:16 — PR 1 unit 1.1 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:api-and-interface-design (public `ingestRawSource` contract + new `EventType`), agent-skills:security-and-hardening (0600 file perms, verbatim-body-on-disk, sanitize-before-WAL invariant, fail-closed on sanitizer error), agent-skills:source-driven-development (verified repo conventions: existing FulcrumEventBus, newId() prefix registry, sanitizeOnWrite fail-closed semantics, appendWal API shape), andrej-karpathy-skills:karpathy-guidelines (no speculative error paths; no auto-resolution of workspace_id — explicit requirement moved to PR 1 unit 1.4), episodic-memory:remembering-conversations (session-start search — no prior PR 1 context found), compound-engineering:git-commit.
- Summary: `ingestRawSource` landed in `packages/memory/src/l0/ingest.ts`. 9-step pipeline (validate source_type → require workspace_id → compute hash/size → sanitize → build frontmatter + path → mkdir 0700 + writeFileSync 0600 → insert `l0_sources` row → `appendWal` with sha256 only → `emitEvent('l0_ingested')`). Extends `EventType` in `packages/core/src/types.ts` with `'l0_ingested'`; adds `l0_source: 'l0src_'` to `PREFIXES` in `packages/core/src/ids.ts`. 13 new vitest cases in `src/tests/l0-ingest.test.ts` cover path shape, verbatim body, 0600 perms, DB row, hash/size, event emission (reuses existing `FulcrumEventBus` per review C1), actor resolution, validation, ULID uniqueness, binary-byte preservation.
- Commit: 2c04179 (+434 lines across 5 files: types.ts +2, ids.ts +2, l0/ingest.ts new +200, memory index.ts +12 barrel re-exports, test +210).
- Next: PR 1 unit 1.2 — split `writeMemoryFile` in `packages/memory/src/vault/client.ts` into `writeRawFile` + `writeCuratedFile`. Back-compat wrapper routes to curated until PR 2 cutover.
- Notes: ulid-guard failure on first test run correctly caught bare `ulid()` usage — switched to `newId('l0_source')` (repo convention enforced by `packages/core/src/tests/ulid-guard.test.ts`). No other regressions. fulcrum-memory suite 658/658 (was 645, +13 new tests). fulcrum-agent-core suite 574/574 + 4 skipped. Full `pnpm -r build` clean. Same doc-commit discipline observed (plan/ledger edits in working tree only).

### 2026-04-18 22:14 — PR 2 — COMPLETE (all 8 units shipped)
- Skills invoked across units: agent-skills:context-engineering, agent-skills:test-driven-development, agent-skills:incremental-implementation, agent-skills:api-and-interface-design (validator error codes are a public surface; L1 page primitives are the single supported writer), agent-skills:code-review-and-quality (self-review after every unit — caught plan drift on page template supersession fields before commit; caught dist/ URL resolution failure before ship), agent-skills:security-and-hardening (constraint #15 curator-batch allowlist; path traversal + null-byte rejection in resolveWikilink), andrej-karpathy-skills:karpathy-guidelines (no speculative abstractions; one primitive per unit; no orthogonal refactors), elements-of-style:writing-clearly-and-concisely (template prose), compound-engineering:git-commit.
- Units shipped:
  - 2.1 Four `.md` templates + smoke gate — commit 09e9585 (+225, 5 files)
  - 2.4 `l1/wikilinks.ts` extract/render/resolve — commit c5af301 (+218, 2 files)
  - 2.6 `l1/frontmatter.ts` serializer — commit 32f16a4 (+286, 2 files)
  - 2.5 `l1/entities.ts` upsert/addEdge/getEntityGraph + `ent_`/`edg_` ID prefixes — commit b348f56 (+427, 3 files)
  - 2.3 `l1/validator.ts` — all 7 rules + constraint #15 — commit fdc8040 (+431, 2 files)
  - 2.2 `l1/page.ts` create/read/update/supersede — commit c014b44 (+460, 2 files)
  - 2.7 Template loader + `fulcrum memory page create` CLI + memory index re-exports — commit d0d8bfa (+284, 4 files)
  - 2.8 End-to-end integration test — commit 1840c61 (+225, 1 file)
  - Bonus: `fulcrum memory page show <id>` for Verify-gate parity — commit e20e47b (+19, 1 file)
- PR 2 totals: 9 code commits, +2575 lines, 0 regressions. fulcrum-memory 778/778 (was 672 at PR 1 close — +106 new tests). Full `pnpm -r build` clean.
- Verify gate (`fulcrum memory page create --template entity` → show): passes end-to-end via the CLI plumbing landed at 2.7+.
- Implementation-detail judgment calls made (per OPEN-QUESTIONS GUARD — raise if any is wrong before PR 3):
  1. Template runtime load: chose inline TS constants + .md parity test over `new URL(import.meta.url)`. Rationale: tsup bundles the memory package flat into `dist/index.js`; relative URLs collapse to `dist/` root and the multi-subdirectory layout breaks. Inline constants preserve human-editable .md as source-of-truth via parity tests; editing .md without updating the constants fails CI. Reversible: swap to a bundler-aware loader if we ever publish templates independently.
  2. Validator library: deferred (plan line 61 suggested a library decision at PR 2 time). Hand-rolled the 7 rules instead since most are cross-cutting (wikilink-to-source matching, entity existence, supersession chain) and don't express cleanly as JSON-Schema or Zod. Worth revisiting at PR 3 when curator output validation arrives and Structured Outputs already constrain shape.
  3. L1 memories.scope column: set to `'project'` for every L1 page. Didn't branch on type. Synthesis pages may eventually want `'workspace'` scope; revisit if retrieval needs it.
  4. Page dir sharding: entity→entities/, concept→concepts/, page→pages/, synthesis→synthesis/ (kept singular since there's no natural plural). Codified in `TYPE_DIR` at `l1/page.ts`.
  5. Supersession DB layout: `superseded_by` scalar, `supersedes` JSON array — matches the v3 migration columns from unit 0.2.
- Known follow-ups deliberately deferred to later PRs:
  - L2 embedding on L1 page writes (handled by PR 4).
  - MCP parity for `fulcrum memory page *` commands (handled by PR 5 unit 5.4 when the full inspection/correction surface ships).
  - Entity deduplication across workspaces (plan Open Question #3 — unresolved).
  - Prompt-version pinning on pages (plan Open Question #2 — unresolved; relevant once curator lands in PR 3).
- Next: PR 3 (curator pipeline, BOOTSTRAP MODE) begins with codex:gpt-5-4-prompting as the load-bearing skill. Before starting: read the GPT-5.4 prompting skill + codex CLI runtime + codex result-handling skills end-to-end; they compose the curator prompt and parse its JSONL output.
- Notes: Same doc-commit discipline observed (plan + ledger edits working-tree only per feedback_never_commit_docs; ledger entry lands in a separate `docs(plans):` commit). Pre-existing unrelated WIP (agent-integration/, packages/core/janitor.ts, packages/worktrees/, .pi-lens/, .codex, plan edits from earlier sessions) left untouched across all 9 commits. Prompt file updated at ca14224 — "one invocation = one full PR" per user steer mid-session.

### 2026-04-18 23:17 — PR 4 unit 4.1 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development (5 new cases — same-ref barrel pins + bounded-parallelism check), agent-skills:api-and-interface-design (public function names preserved; new `l2/{queue,embed,code}` surface is the internal boundary), agent-skills:performance-optimization (bounded-queue invariant protected by test — peak in-flight ≤ EMBED_CONCURRENCY), andrej-karpathy-skills:karpathy-guidelines (surgical move — zero behaviour change), compound-engineering:git-commit.
- Summary: Three new files under `packages/memory/src/l2/`. `queue.ts` owns the EMBED_CONCURRENCY queue + `enqueueEmbed` + `trackAsyncWork` + `flushPendingMemoryWrites` + `waitForEmbedHeadroom`. `embed.ts` hosts `storeEmbeddingInVec` (vec_memories + memories.embedding). `code.ts` hosts `storeChunkEmbedding` + `scheduleChunkEmbedding` (vec_chunks + code_chunks.embedding). `write.ts` re-exports the public names so cli, indexer/registry.ts, ingest.ts, and pci/syncer.ts keep compiling against `./write.js`.
- Commit: 9c85145 (5 files: 3 l2 sources + test + write.ts trim; +272/-184)
- Next: PR 4 unit 4.2 — add `recordL1Embedding(db, page_id)` and invoke it from the curator apply-layer (`createCuratedPage`, `updateCuratedPage`, `supersedeCuratedPage`). Supersession: old vec_memories row stays (audit, not deletion); new page gets its own row.
- Notes: fulcrum-memory 860/860 (was 855 — +5 new relocation tests). fulcrum-cli 393/393. Full `pnpm -r build` clean. Same doc-commit discipline observed — this ledger entry lands in a separate `docs(plans):` commit.

### 2026-04-18 23:05 — PR 3 — COMPLETE (all 8 units shipped)
- Skills invoked across units: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:api-and-interface-design (CuratorInput/Output/Backend/LogEntry = load-bearing public contracts), agent-skills:source-driven-development + find-docs (ctx7 for OpenAI Structured Outputs + `codex exec --help` for subprocess contract), agent-skills:security-and-hardening (Constraints §14 delimiter isolation, §15 allowlist defense-in-depth at parser AND apply layers, §16 credential redaction across all three backends), codex:gpt-5-4-prompting (load-bearing — XML-blocked curator prompt), codex:codex-cli-runtime + codex:codex-result-handling (subprocess contract + result parsing), compound-engineering:agent-native-architecture (backend registry is the agent-facing extension point), andrej-karpathy-skills:karpathy-guidelines, compound-engineering:git-commit.
- Units shipped:
  - 3.1 `l1/curator.ts` — prompt composer + JSON Schema + parser + dispatcher — commit 277a1b9 (+1275, 3 files)
  - 3.2 `l1/curator-backend/codex.ts` — subprocess + JSONL stream — commit e71e0cb (+453, 3 files)
  - 3.3 `l1/curator-backend/pi.ts` — stub placeholder — commit 66e69bd (+84, 3 files)
  - 3.4 `l1/curator-backend/openai.ts` — Structured Outputs via fetch — commit 376ff46 (+390, 3 files)
  - 3.5 `l1/apply.ts` — atomic diff executor (DB txn + vault rollback) — commit fcd1846 (+570, 3 files)
  - 3.6 `fulcrum memory curate` CLI — commit de2a5c9 (+368, 3 files)
  - 3.7 `l1/telemetry.ts` — JSONL audit log at `vault/curated/log.md` — commit 71a66a3 (+240, 5 files)
  - 3.8 integration tests — 6 cases exercising the full stack — commit dd411d0 (+390, 1 file)
- PR 3 totals: 8 code commits, +3770 lines, 0 regressions. fulcrum-memory 855/855 (was 778 at PR 2 close — +77 new tests). fulcrum-cli 393/393 (was 379 — +14 new tests). Full `pnpm -r build` clean.
- Verify gate: `fulcrum memory curate --dry-run` prints diff JSON without writing; live run lands pages on disk + in `memories`; `vault/curated/log.md` records both runs with correct backend + prompt_version=v3.0.0; `--backend openai` routes to the API path. Proven by 6 integration cases in unit 3.8.
- Constraint §15 defense-in-depth verified at both layers: parser (`parseCuratorOutput` rejects fabricated ULIDs before output crosses the runtime boundary) AND apply (`createCuratedPage` re-runs validator with `curator_input_sources`) — belt-and-suspenders against LLM hallucination.
- Implementation-detail judgment calls made (per OPEN-QUESTIONS GUARD — raise if wrong before PR 4):
  1. **Backend registry**: backends NOT auto-registered on import. Consumers (CLI bootstrap) call `registerDefaultCuratorBackends()` which uses if-absent semantics so test stubs survive. Rationale: tests need an empty registry; auto-registration side effects broke stubs in the first red run of unit 3.6 — fix confirmed before adding tests.
  2. **`new_entities` deferred**: plan's CuratorOutput shape is `{new_pages, updates, supersessions, new_edges}`. Adding `new_entities` crosses the public-contract line (CuratorOutput is exported). First-run bootstrapping references pre-existing graph_entities only; validator rule 6 (UNKNOWN_ENTITY) rejects hallucinated entity IDs. Raise this if it blocks graph growth in practice.
  3. **confidence_deltas telemetry**: records the declared confidence values from the CuratorOutput, not true before/after deltas. Computing deltas would require apply-layer to capture pre-update confidence per page. Deferred to a later PR if the eval harness (PR 8) actually needs deltas.
  4. **OpenAI endpoint**: used `/v1/chat/completions` with `response_format.json_schema.strict:true` + top-level `reasoning_effort`. Plan allows either Chat Completions or Responses API; Chat Completions is stable for GPT-5 and the simpler integration. Swap to `/v1/responses` in a follow-up if batch-API (Phase 6 backfill) demands it.
  5. **Codex subprocess sandbox**: `--sandbox read-only` is correct — the curator returns a JSON object; no tool use needed. Running with `workspace-write` would grant unnecessary write authority.
  6. **Credential redaction patterns**: regex-based on sk-/AKIA/Bearer/*_KEY= shapes — fail-open (leaves other stderr text intact). More aggressive redaction would hide actionable error messages; this bar matches the existing sanitize engine.
- Known follow-ups deliberately deferred:
  - pi backend wiring (plan explicitly says "stub in PR 3").
  - Anthropic backend wiring (plan says "ANTHROPIC_API_KEY → Claude Haiku via API" — no urgency; openai + codex cover the 95% case).
  - L2 embedding of L1 pages (handled by PR 4).
  - MCP parity for `fulcrum memory curate` (handled by PR 5 unit 5.4).
  - `new_entities` in CuratorOutput (see judgment call 2).
- Next: PR 4 — L2 reshape. Relocates `storeEmbeddingInVec` + `storeChunkEmbedding` into `packages/memory/src/l2/`, triggers `recordL1Embedding` after each curator page write, ships `fulcrum memory reindex-l2` operator command. Load-bearing skills: agent-skills:performance-optimization (embedding batch queue + p95 budget), find-docs on @xenova/transformers batch-embed API, compound-engineering:review:performance-reviewer pre-merge.
- Notes: Same doc-commit discipline observed — every ledger edit lands in a dedicated `docs(plans):` commit per feedback_never_commit_docs. Pre-existing unrelated WIP (agent-integration/, packages/core/janitor.ts, packages/worktrees/, .pi-lens/, .codex, plan edits from other sessions) left untouched across all 8 code commits. Stopping per STOP CONDITIONS — end-of-PR hand-off.

### 2026-04-18 23:02 — PR 3 unit 3.7 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:test-driven-development (4 + 2 TDD cases), agent-skills:api-and-interface-design (CuratorLogEntry = pinned public schema; add-only non-breaking), agent-skills:documentation-and-adrs (header comment on telemetry.ts lists the downstream consumers — PR 7.4 lint, PR 8 eval harness), andrej-karpathy-skills:karpathy-guidelines, compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/telemetry.ts` (+44 lines) exports `appendCuratorLog(vaultRoot, entry)` that JSONL-appends to `vault/curated/log.md` (creates parent dir on first write). CLI `curateMemory` now emits one record per call — live runs AND `--dry-run` runs — so audit covers skipped curations. `confidence_deltas` reports the declared confidence values from the CuratorOutput (true before/after deltas deferred; would need pre-read in apply-layer).
- Commit: 71a66a3 (5 files: telemetry.ts +44, telemetry test +96, memory index +4, cli curate handler +51, cli curate test +23)
- Next: PR 3 unit 3.8 — integration test consolidating the full curator pipeline (stub backend + seeded L0 + end-to-end apply + telemetry assertions). Also marks the PR 3 Verify gate.
- Notes: fulcrum-memory suite 855/855 (was 851 — +4 new telemetry tests). fulcrum-cli suite 387/387 (was 385 — +2 telemetry CLI tests). `pnpm -r build` clean.

### 2026-04-18 22:58 — PR 3 unit 3.6 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:test-driven-development (6 TDD cases — stub-backend end-to-end, dry-run no-op, flag routing, not-found, missing-file, default-registration), agent-skills:api-and-interface-design (CLI flag surface = public contract; kept it minimal: `<l0_id>`, `--dry-run`, `--backend`, `--task`, `--model`, `--reasoning`), compound-engineering:review:cli-readiness-reviewer (JSON-only stdout for agent consumption; human-readable `--help` only when TTY-less or explicit), andrej-karpathy-skills:karpathy-guidelines (no config-file indirection; env + flags only), compound-engineering:git-commit.
- Summary: `packages/cli/src/commands/memory-curate.ts` (+130 lines) exports `curateMemory(input)` which loads the l0_sources row, reads the raw body from disk (frontmatter strip via inline `---\n...\n---\n` split — no gray-matter dep added to the CLI package), registers codex/pi/openai if absent, runs the curator, and dispatches to applyCuratorOutput. Wired into `packages/cli/src/index.ts` dispatcher under the `memory curate` subcommand with full `--help`. Output is a JSON object `{l0_id, backend, model, prompt_version, duration_ms, dry_run, apply}` for agent consumption.
- Commit: de2a5c9 (3 files: commands/memory-curate.ts +130, tests/memory-curate.test.ts +137, cli/index.ts +46)
- Next: PR 3 unit 3.7 — curator telemetry. Append `vault/curated/log.md` audit entry `{l0_id, backend, affected_pages[], new_entities[], confidence_deltas[], duration_ms, prompt_version}` after each curate run.
- Notes: registerDefaultCuratorBackends uses `getBackend() ?? registerBackend()` (if-absent semantics) so test stubs survive the default pass — a regression-trap I caught on the first red run and fixed before adding more tests. fulcrum-cli suite 385/385. Full `pnpm -r build` clean.

### 2026-04-18 22:52 — PR 3 unit 3.5 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:test-driven-development (10 TDD cases — happy path + rollback + dry-run), agent-skills:api-and-interface-design (ApplyContext / ApplyResult are agent-facing contracts; CuratorOutput→vault mapping is deterministic), agent-skills:security-and-hardening (validator `curator_input_sources` re-check at apply-time — defense-in-depth beyond the parser-layer check), andrej-karpathy-skills:karpathy-guidelines (no vault-rollback framework; tracked paths + unlink on error, nothing more), compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/apply.ts` (+192 lines) orchestrates CuratorOutput execution inside a single `db.transaction()`. new_pages → createCuratedPage (id/first_seen/last_confirmed filled by apply-layer); updates → updateCuratedPage with add_sources/add_entities merged+deduped + last_confirmed refreshed; supersessions → supersedeCuratedPage (audit chain preserved); new_edges → addEdge (throws on missing endpoint). On any exception, the DB transaction rolls back and vault files written during the attempt are unlinked (ULID-named, so cleanup is safe). dry_run=true short-circuits to a diff-shaped ApplyResult with no DB/vault side effects — wires into `fulcrum memory curate --dry-run` next unit.
- Commit: fcd1846 (3 files: apply.ts +192, test +273, memory index +3)
- Next: PR 3 unit 3.6 — `fulcrum memory curate` CLI. Wires runCurator → applyCuratorOutput, registers codex/pi/openai backends at startup, supports --dry-run and --backend flags.
- Notes: OPEN-QUESTIONS GUARD judgment call — the plan's CuratorOutput shape is `{new_pages, updates, supersessions, new_edges}` with no `new_entities` field. First-run bootstrapping therefore needs edges/page-entities to reference already-existing graph_entities; the curator that hallucinates an entity ID is rejected by validator rule 6 (UNKNOWN_ENTITY). Adding `new_entities` crosses a public-contract line (CuratorOutput is exported), so deferred to a follow-up rather than changing the schema mid-PR. fulcrum-memory suite 851/851 (was 841 — +10 new tests). `pnpm -r build` clean.

### 2026-04-18 22:46 — PR 3 unit 3.4 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:test-driven-development (13 TDD cases against a local `http.createServer` stub — no real network), agent-skills:source-driven-development + find-docs (verified Chat Completions Structured Outputs contract via ctx7 against /websites/developers_openai_api — POST /v1/chat/completions with `response_format.json_schema.strict:true` + top-level `reasoning_effort`; `prompt_tokens_details.cached_tokens` for cached-input accounting), agent-skills:api-and-interface-design, agent-skills:security-and-hardening (Constraint §16 — OPENAI_API_KEY env-only, never logged, redacted from error bodies; assert-no-leak test), andrej-karpathy-skills:karpathy-guidelines (native `fetch` — no SDK dep added), compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/curator-backend/openai.ts` (+141 lines) implements the OpenAI backend via Node's native `fetch`. POSTs the composed prompt as a single user message, wraps the curator JSON Schema in `response_format.json_schema` with `strict:true`, and passes `reasoning_effort`. Extracts `choices[0].message.content` → `raw_text`; maps `usage.prompt_tokens` → `input_tokens`, `usage.prompt_tokens_details.cached_tokens` → `cached_input_tokens`, `usage.completion_tokens` → `output_tokens`. Honors `timeout_ms` via AbortController. `FULCRUM_CURATOR_OPENAI_BASE_URL` env override lets tests swap in a local HTTP stub.
- Commit: 376ff46 (3 files: backend +141, test +235, memory index +1)
- Next: PR 3 unit 3.5 — deterministic apply-layer (takes CuratorOutput + executes via l1/page.ts + l1/entities.ts in a single SQLite transaction).
- Notes: fulcrum-memory suite 841/841 (was 828 — +13 new tests). `pnpm -r build` clean.

### 2026-04-18 22:41 — PR 3 unit 3.3 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:test-driven-development, agent-skills:api-and-interface-design (CuratorBackend contract), andrej-karpathy-skills:karpathy-guidelines (no speculative implementation — plan explicitly says stub), compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/curator-backend/pi.ts` (+33 lines) reserves the pi slot in the dispatcher fallback order. `isAvailable()` always returns false until pi's non-interactive + structured-output contract stabilizes; `curate()` throws a NotImplementedError with install guidance (`FULCRUM_CURATOR_BACKEND=codex|openai`). Keeping it unavailable means auto-select skips pi even when `pi` is on PATH — routing curator traffic through an unfinished contract is riskier than skipping the slot.
- Commit: 66e69bd (3 files: backend +33, test +44, memory index +1)
- Next: PR 3 unit 3.4 — `l1/curator-backend/openai.ts`. Direct OpenAI API via Node `fetch` (no SDK dep), `response_format: { type: 'json_schema', strict: true }`. Verify Structured Outputs spec via find-docs before writing.
- Notes: fulcrum-memory suite 828/828 (+3 new tests). `pnpm -r build` clean.

### 2026-04-18 22:39 — PR 3 unit 3.2 — completed
- Skills invoked: agent-skills:incremental-implementation, agent-skills:test-driven-development (12 TDD cases via canned-JSONL stub), agent-skills:api-and-interface-design (CuratorBackend contract matched), agent-skills:security-and-hardening (Constraint #16 credential redaction on stderr — sk-/AKIA/Bearer/*_KEY= patterns; 0600 schema file perms; read-only sandbox), agent-skills:source-driven-development (ran `codex exec --help` + emitted canned JSONL to confirm the event shape before coding), codex:codex-cli-runtime + codex:codex-result-handling (consulted for the event contract), andrej-karpathy-skills:karpathy-guidelines, compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/curator-backend/codex.ts` (+230 lines) spawns `codex exec -m <model> -c model_reasoning_effort=<reasoning> --json --output-schema=<schema.json> --ephemeral --skip-git-repo-check --sandbox read-only`, pipes the prompt on stdin, and parses the JSONL event stream (`thread.started` → `turn.started` → `item.completed{agent_message.text}` → `turn.completed{usage}`). Captures model usage, honors `timeout_ms` with SIGTERM→SIGKILL escalation, redacts credential-shaped tokens on stderr before propagating error text. `FULCRUM_CODEX_BINARY` env var lets tests swap in a Node stub so CI makes no real LLM call.
- Commit: e71e0cb (3 files: backend +230, test +202, memory index +3 barrel re-export)
- Next: PR 3 unit 3.3 — `l1/curator-backend/pi.ts` stub. Same CuratorBackend shape; stub implementation fails loudly with install guidance when invoked (pi non-interactive mode not stable yet per plan).
- Notes: Explicitly chose NOT to auto-register the backend on import — tests can keep a clean registry. fulcrum-memory suite 825/825 (was 813 — +12 new tests matches). Full `pnpm -r build` clean. Doc-commit discipline observed (this ledger entry stays working-tree only until the end-of-PR docs commit).

### 2026-04-18 22:33 — PR 3 unit 3.1 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development (35-test TDD gate written before implementation), agent-skills:api-and-interface-design (CuratorInput / CuratorBackend interface is the public contract 3.2-3.4 build against), agent-skills:security-and-hardening (Constraint #14 `<USER_CONTENT>` + `<AGENT_CORRECTION>` delimiter isolation; Constraint #15 curator-sources-in-batch allowlist as defense-in-depth at the parser layer), agent-skills:source-driven-development (verified `codex exec --help` + JSONL stream shape against codex-cli 0.121.0), codex:gpt-5-4-prompting (load-bearing — composed the XML-blocked prompt: `<task>`/`<templates>`/`<structured_output_contract>`/`<grounding_rules>`/`<verification_loop>`), codex:codex-cli-runtime + codex:codex-result-handling (read for PR 3 context; actual subprocess contract lands in 3.2), compound-engineering:agent-native-architecture (backend registry is the agent-facing extension point), andrej-karpathy-skills:karpathy-guidelines (no speculative error paths, no redundant types, sparse comments — only the `<USER_CONTENT>` isolation and Constraint #15 defense-in-depth rationale carry inline notes), compound-engineering:git-commit.
- Summary: `packages/memory/src/l1/curator.ts` (+566 lines) ships the curator runtime: `PROMPT_VERSION='v3.0.0'`, `TASK_DEFAULTS` per the plan table (extraction `gpt-5-mini`/minimal, consolidation `gpt-5-nano`/minimal, synthesis `gpt-5`/medium), `composePrompt()` with per-task instructions + XML delimiter wrapping, `getOutputSchema()` strict-mode-compatible JSON Schema (`additionalProperties:false`, all required, no allOf/if/const/pattern — works across codex --output-schema, OpenAI Structured Outputs, Anthropic tool_use unchanged), `parseCuratorOutput()` tolerant of markdown fences + model preamble + Constraint #15 allowlist check, `registerBackend`/`getBackend`/`listBackends`/`clearBackendsForTest` registry, `selectBackend()` with env override > codex > pi > openai > anthropic fallback order, `runCurator()` orchestrator. Memory index re-exports the full surface. 35 new vitest cases cover prompt determinism, wrapper correctness for L0 + corrections, schema strictness (regex-asserts absence of allOf/if/then/else/const/pattern), parser robustness across 10 rejection cases, backend selection (env override, auto-select order, unregistered-override rejection, no-backend-available message), and end-to-end runCurator via stub backends.
- Commit: 277a1b9 (3 files: curator.ts +566, test +463, memory index +33; +1275 total)
- Next: PR 3 unit 3.2 — `l1/curator-backend/codex.ts`. Verified at orient-time that `codex exec` supports `--json`, `--output-schema <FILE>`, `-m/--model`, `-c key=value` for reasoning effort, `--ephemeral`, `--skip-git-repo-check`. JSONL event stream verified: `thread.started` → `turn.started` → `item.completed { item: { type: 'agent_message', text: ... } }` → `turn.completed { usage }`.
- Notes: Backends register themselves (not constructor-injected) so the memory package doesn't bundle openai/anthropic deps into dist when they're not needed. Tests clear the registry per-run via `clearBackendsForTest()`. Full memory suite 813/813 (was 778 at PR 2 close — +35 new tests matches). `pnpm -r build` clean. Same doc-commit discipline observed (ledger stays working-tree-only until the end-of-unit docs commit).

### 2026-04-18 21:41 — PR 2 unit 2.1 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development (23-case smoke gate written red before any template file existed), agent-skills:code-review-and-quality (self-review: plan-verbatim transcription, diffed my first page.template.md against the plan and caught drift — added supersedes/superseded_by that the plan omits for type:page, reverted to flow-style `sources: [{{L0_ULID}}]`), andrej-karpathy-skills:karpathy-guidelines (surgical; no runtime loader, no asset-copy tsup config — those belong to unit 2.2/2.3), elements-of-style:writing-clearly-and-concisely (template scaffolding prose), episodic-memory:remembering-conversations (session-start search — no prior PR 2 context; note: ledger's previous "decide Open Question #2 validator library" is a mis-numbering — plan's Q2 is prompt-version pinning; validator lib is deferred to 2.3), compound-engineering:git-commit.
- Summary: Four canonical L1 page templates landed under `packages/memory/src/l1/templates/` as `.md` files — `entity.template.md` (supersession + aliases + entity_type), `concept.template.md` (sources OR sources_via), `page.template.md` (source distillation; no supersession fields per plan), `synthesis.template.md` (sources_via mandatory; retention_tier: episodic). Every template carries v3 schema field, ULID placeholder, retention_tier, access_count, workspace/project_id, and ≥1 `[[raw/...]]` inline wikilink. Smoke gate at `src/tests/l1-templates.test.ts` (23 tests) checks file presence, frontmatter contract, body contract (H1 + wikilink), and absence of TODO/FIXME/XXX markers that would trip unit 2.3's validator.
- Commit: 09e9585 (+225 lines, 5 net-new files; 4 templates + 1 test).
- Next: PR 2 unit 2.2 — `l1/page.ts` with `createCuratedPage(template, vars)`, `updateCuratedPage`, `supersedeCuratedPage`, `readCuratedPage`. Every write runs through `validateL1Page` before it hits disk. Stub the validator first so 2.2 can ship; 2.3 fills in the real rule set. Also at 2.2 time: decide the dist/ asset story for templates (inline as TS constants vs. tsup `onSuccess` copy vs. `fs.readFileSync(new URL(...))` off `import.meta.url` — the third works in dev but needs a copy step for published `dist/`). gray-matter `^4.0.3` already in `packages/memory` deps so no lib fetch needed for 2.3 frontmatter parse (ajv vs zod is the remaining 2.3 decision, still deferred).
- Notes: fulcrum-memory suite 695/695 (was 672 at PR 1 close; +23 new tests matches exactly). Full `pnpm -r build` clean. Same doc-commit discipline observed — templates + test in one code commit; this ledger entry lands in a separate docs commit per `feedback_never_commit_docs`. Pre-existing unrelated WIP (agent-integration/, packages/core/janitor.ts, packages/worktrees/, .pi-lens/, .codex, plan edits, etc.) left untouched.
