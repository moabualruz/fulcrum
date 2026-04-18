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

### 2026-04-18 21:41 — PR 2 unit 2.1 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:incremental-implementation, agent-skills:test-driven-development (23-case smoke gate written red before any template file existed), agent-skills:code-review-and-quality (self-review: plan-verbatim transcription, diffed my first page.template.md against the plan and caught drift — added supersedes/superseded_by that the plan omits for type:page, reverted to flow-style `sources: [{{L0_ULID}}]`), andrej-karpathy-skills:karpathy-guidelines (surgical; no runtime loader, no asset-copy tsup config — those belong to unit 2.2/2.3), elements-of-style:writing-clearly-and-concisely (template scaffolding prose), episodic-memory:remembering-conversations (session-start search — no prior PR 2 context; note: ledger's previous "decide Open Question #2 validator library" is a mis-numbering — plan's Q2 is prompt-version pinning; validator lib is deferred to 2.3), compound-engineering:git-commit.
- Summary: Four canonical L1 page templates landed under `packages/memory/src/l1/templates/` as `.md` files — `entity.template.md` (supersession + aliases + entity_type), `concept.template.md` (sources OR sources_via), `page.template.md` (source distillation; no supersession fields per plan), `synthesis.template.md` (sources_via mandatory; retention_tier: episodic). Every template carries v3 schema field, ULID placeholder, retention_tier, access_count, workspace/project_id, and ≥1 `[[raw/...]]` inline wikilink. Smoke gate at `src/tests/l1-templates.test.ts` (23 tests) checks file presence, frontmatter contract, body contract (H1 + wikilink), and absence of TODO/FIXME/XXX markers that would trip unit 2.3's validator.
- Commit: 09e9585 (+225 lines, 5 net-new files; 4 templates + 1 test).
- Next: PR 2 unit 2.2 — `l1/page.ts` with `createCuratedPage(template, vars)`, `updateCuratedPage`, `supersedeCuratedPage`, `readCuratedPage`. Every write runs through `validateL1Page` before it hits disk. Stub the validator first so 2.2 can ship; 2.3 fills in the real rule set. Also at 2.2 time: decide the dist/ asset story for templates (inline as TS constants vs. tsup `onSuccess` copy vs. `fs.readFileSync(new URL(...))` off `import.meta.url` — the third works in dev but needs a copy step for published `dist/`). gray-matter `^4.0.3` already in `packages/memory` deps so no lib fetch needed for 2.3 frontmatter parse (ajv vs zod is the remaining 2.3 decision, still deferred).
- Notes: fulcrum-memory suite 695/695 (was 672 at PR 1 close; +23 new tests matches exactly). Full `pnpm -r build` clean. Same doc-commit discipline observed — templates + test in one code commit; this ledger entry lands in a separate docs commit per `feedback_never_commit_docs`. Pre-existing unrelated WIP (agent-integration/, packages/core/janitor.ts, packages/worktrees/, .pi-lens/, .codex, plan edits, etc.) left untouched.
