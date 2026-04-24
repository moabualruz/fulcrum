# Cross-Plan Handoff Review: Memory v2a → v2b

## Verdict

**BLOCKED.** One P0 defect runs through both plans: Dreaming is in v2a per the authoritative scope split (`00-scope-split.md` lines 63 + 106), but the v2a plan explicitly defers Dreaming to v2b in its overview (line 5) and ships zero Dreaming work, while the v2b plan reads as if v2a delivered Dreaming light-phase code (PR 11 line 139). This breaks scope discipline, leaves §11.5 / §11.14 / §11.15 / §11.16 unsatisfied at end-of-v2a, and forces v2b PR 11 to either re-plan (REM is built on a foundation that doesn't exist) or quietly absorb v2a-deferred work. There are also two AC scope-split violations (§11.32 and §11.50 are deferred to v2b but claimed by v2a) and one orphaned AC (§11.9 — Pi cockpit `file_patch` writes never claimed by either plan). Apart from these, the plans are mostly clean: prerequisite gates are well-referenced, forward compatibility (Kuzu DDL, recall envelope, scope enum, WAL ordering, PCI watcher topology) is explicit, and the 10 critical constraints are preserved verbatim in both plans.

## Scope of this review

Read fully: `2026-04-16-memory-v2a-plan.md` (576 lines), `2026-04-16-memory-v2b-plan.md` (528 lines), `2026-04-16-memory-architecture-v2/00-scope-split.md` (232 lines), `2026-04-16-memory-v2-split-handover.md` (163 lines), `2026-04-16-memory-v2-copy-file-manifest.md` (278 lines), `07-acceptance-and-planning.md` §11 + §12 (lines 1-110, plus §11.60-70 verified in `08-per-host-plugin-integration.md`). Verified existence and current shape of `packages/memory/src/{kuzu/schema.ts, scoring.ts, recall.ts, ingest.ts, write.ts, vault/watcher.ts}`, `packages/cli/src/hooks.ts`, `packages/core/src/db/schema.ts`. Did NOT independently audit Parts 02-06 of the brainstorm corpus or any test files.

## Findings

### P0 — Blocking (must fix before user approves either plan)

#### P0-1: Dreaming scope contradiction across both plans (three linked defects)

**Where:**
- `00-scope-split.md:63` — "Dreaming light / REM / deep phases (§8 — Part 06)" listed in **v2a "What v2a ships" → Memory tiers + Dreaming** section.
- `00-scope-split.md:106` — v2a-AC subset includes "§11.5 (with updated thresholds per safe-fix #1)".
- `2026-04-16-memory-v2a-plan.md:5` — Overview reads: "Everything beyond this baseline (...Dreaming, global pointer, LongMemEval, Copilot, plugin marketplace bundles) is deferred to v2b." No PR ships Dreaming.
- `2026-04-16-memory-v2a-plan.md:43` — PR 1 Task 1 claims `§11.14` (which says "every durable entry has `embedded=1` after Dreaming deep phase completes" — unsatisfiable without Dreaming).
- `2026-04-16-memory-v2b-plan.md:139` — PR 11 description: "Reframes v2a's Dreaming light-phase code into REM (entity/relationship extraction → Kuzu) + deep-phase promotion."

**Why blocking:** Three linked failures —
1. v2a plan **violates scope-split** by deferring Dreaming.
2. v2a plan **claims ACs it cannot satisfy** without Dreaming: §11.5 (deep-phase promotion), §11.14 (post-Dreaming embedded flag), §11.15 (light-phase dangling link report), §11.16 (deep-phase supersession). All four are in the v2a AC subset per scope-split:106.
3. v2b PR 11 **assumes a nonexistent foundation** ("Reframes v2a's Dreaming light-phase code") — if v2a doesn't ship Dreaming, v2b PR 11 must either grow to include the light phase or re-sequence with a new "Dreaming foundation" PR before the REM port.

**Suggested fix:** Either (a) add a v2a PR for Dreaming light/REM/deep phases (likely ~1 week, and add it as PR 5b or PR 10a, before per-host correctness cluster) and explicitly map §11.5/§11.14/§11.15/§11.16 to that PR; OR (b) update `00-scope-split.md` to defer Dreaming to v2b and remove §11.5/§11.14/§11.15/§11.16 from the v2a-AC subset, then drop the corresponding AC claims from v2a PR 1 Task 1 and rewrite v2b PR 11 to ship light + REM + deep + procedural in one sequence (~2 weeks). Whichever is chosen, both plans + scope-split must agree.

#### P0-2: §11.32 (WAL replay) double-claimed as v2a + v2b in conflict with scope-split

**Where:**
- `00-scope-split.md:110` — "Deferred to v2b: ...§11.32 (WAL replay — stay as future capability; ensure WAL structure supports it)..."
- `2026-04-16-memory-v2a-plan.md:261` — PR 5 Task 26 claims `Maps to AC: §11.32, §11.34`.
- `2026-04-16-memory-v2a-plan.md:528` — Per-PR Acceptance Gates table lists §11.32 under PR 5.
- `2026-04-16-memory-v2b-plan.md:265,280` — PR 15 Tasks 6.1 + 6.3 claim §11.32 (`replay-wal` command).

**Why blocking:** Scope-split is authoritative; §11.32 is v2b-only. v2a may legitimately ship the WAL **structure** that satisfies the AC's "ensure WAL structure supports it" caveat, but it must NOT claim the AC. Otherwise the claim is unsupportable (no `replay-wal` command in v2a means §11.32 fails any honest acceptance test at end-of-v2a).

**Suggested fix:** Remove `§11.32` from v2a PR 5 Task 26 and from the Per-PR Acceptance Gates table at line 528. Keep `§11.34` (WAL redaction — actually satisfied in v2a). Add a note in v2a PR 5 checkpoint: "WAL structure supports v2b PR 15's replay command; AC §11.32 itself is v2b."

#### P0-3: §11.50 (prose ingestion) double-claimed as v2a + v2b in conflict with scope-split

**Where:**
- `00-scope-split.md:108` — v2a-AC subset includes `§11.20 (prose ingestion covers md + configs)` — i.e. only §11.20.
- `00-scope-split.md:110` — "Deferred to v2b: ...§11.50 (prose covers docs — kept but retarget)..."
- `2026-04-16-memory-v2a-plan.md:71,162,214` — PR 1 Task 5, PR 3 Task 15, PR 4 Task 21 all claim `§11.50`.
- `2026-04-16-memory-v2a-plan.md:526,527` — Per-PR table lists §11.50 under PR 3 and PR 4.
- `2026-04-16-memory-v2b-plan.md:443-447,481` — PR 20 Task 11.6 + acceptance-gates table claim §11.50 ("graph-edge surfacing is v2b").

**Why blocking:** Same shape as P0-2. §11.20 (prose chunkers cover md + configs) is the v2a AC; §11.50 (prose surfacing + graph-edge integration) is v2b. v2a's tasks should claim §11.20 only.

**Suggested fix:** Edit v2a PR 1 Task 5 (line 71), PR 3 Task 15 (line 162), PR 4 Task 21 (line 214), and the Per-PR table (lines 526-527) to drop §11.50 and keep §11.20. v2b PR 20 Task 11.6 retains §11.50 as the canonical owner.

### P1 — Important (should fix before merge approval)

#### P1-1: §11.9 (Pi cockpit writes `file_patch`) is orphaned

**Where:** §11.9 (Part 07 line 29): "Pi cockpit writes `file_patch` memories for a Pi-dispatched Write/Edit, reachable via `recall_memory`." Per scope-split:106 this belongs in v2a (§11.1-20 except §11.11... wait — §11.9 is in §11.1-20 and not excluded). v2a per-host cluster Task 51 (line 497) ships Pi cockpit `start|stop|status` CLI but maps only to §11.39 + §11.70 — §11.9 is not claimed.

**Why important:** §11.9 is an end-to-end test (Pi-dispatched edit → memory exists → recall finds it). v2a PR 6 (hook writes) covers the host-agnostic file_patch path and PR 4 ships the cockpit CLI, but no task ties them together with an integration test asserting Pi specifically. Without explicit ownership, no PR's checkpoint enforces it.

**Suggested fix:** Add §11.9 to v2a Task 51's `Maps to AC` line, with a sub-acceptance: "integration test asserts a Write performed via `fulcrum pi cockpit` produces a `file_patch` memory recallable via `recall_memory`." Or add a Task 51a covering the Pi-specific integration test.

#### P1-2: v2b PR 11 (Dreaming REM) prerequisite chain is broken regardless of P0-1 resolution

**Where:** `2026-04-16-memory-v2b-plan.md:138-163`. PR 11 Task 2.1 says "Reframes v2a's Dreaming light-phase code into REM" and `Verify: ... \`fulcrum dream --phase=REM\``. The CLI command `fulcrum dream` does not exist in v2a (no plan task creates it).

**Why important:** Even if P0-1 is fixed by *adding* Dreaming to v2a, the plan must explicitly state that v2a ships `fulcrum dream` CLI surface. If P0-1 is fixed by *deferring all of Dreaming to v2b*, then PR 11 becomes the first PR to ship Dreaming and must include the CLI scaffolding (currently absent from PR 11 task list).

**Suggested fix:** When resolving P0-1, also add: either v2a Dreaming PR ships `fulcrum dream {--phase=light|REM|deep}` CLI; or v2b PR 11 grows a Task 2.0 "Add `fulcrum dream` CLI scaffold + light-phase implementation" before the REM-port task.

#### P1-3: PR 11 Task 2.2 depends on PR 10 reducers but says nothing about v2a Memory↔code edges

**Where:** `2026-04-16-memory-v2b-plan.md:150-155`. Task 2.2 says "REM extraction emits `entity_extracted` events on the event bus; reducers from PR 10 Task 1.5 upsert Entity nodes + `MENTIONS` / `ABOUT` rel rows." But v2a PR 7 Task 38 (line 374) already populates Memory↔code `MENTIONS_SYMBOL` / `ABOUT_FILE` / `ABOUT_SYMBOL` edges via a different reducer (`packages/memory/src/kuzu/reducers/memory.ts`). These two reducer paths overlap.

**Why important:** Two reducers writing the same edge tables risk duplicate edges, race conditions, or one silently winning. The plans don't reconcile.

**Suggested fix:** Add a note to v2b PR 11 Task 2.2 explicitly stating "REM extraction reuses v2a PR 7's `reducers/memory.ts` for Memory↔code edges; only Entity-side reducers (PR 10 Task 1.5) are new." Or refactor v2a PR 7 Task 38's reducer into the central registry that v2b PR 10 builds.

#### P1-4: PCI watcher integration with git ingestion (v2b PR 20 Task 11.1) is asserted but unproven

**Where:**
- `2026-04-16-memory-v2b-plan.md:41` — Architecture Decision #1: "v2b's git ingestion (PR 10) and external-sync writers (PR 20) integrate with the same watcher topology — no second watcher."
- `2026-04-16-memory-v2b-plan.md:407-411` — PR 20 Task 11.1 implements git reducer with two paths: post-commit hook + Dreaming light-phase periodic walker. Neither integrates with `packages/memory/src/pci/watcher.ts`.

**Why important:** The architecture decision claims watcher reuse, but the actual task description shows git ingestion using independent paths (hook + periodic walker). The "no second watcher" claim is technically true (no `fs.FSWatcher` is allocated), but the integration point with PCI watcher events is undescribed. If git changes and PCI watcher both emit `file change` events for the same file, dedup is unspecified.

**Suggested fix:** Either (a) clarify in PR 20 Task 11.1 that git events are orthogonal to PCI watcher events (no integration needed because git events fire on commit, not on file write); OR (b) add a Task 11.1a specifying how PCI watcher's file-change stream feeds into git reducer's logic (e.g., "PCI `change` events for files matching `git diff` post-commit are deduplicated against the post-commit hook").

#### P1-5: v2a PR 4 Task 22 vault-watcher dedup uses chokidar and PCI watcher uses fs.watch — but plans don't address an event-equivalence guarantee

**Where:** `2026-04-16-memory-v2a-plan.md:217-222`. Task 22 says "Both watchers emit `content_change` events on `fulcrum-core` event stream with disjoint `kind: 'memory'|'code'` tags." Vault watcher uses chokidar, PCI watcher uses `fs.watch`. The two libraries fire events on different OS-level signals and at different rates.

**Why important:** v2b PR 20 Task 11.1 (git reducer Dreaming-walker path) and PR 11 Task 2.1 (REM extraction over short-term entries) consume the event stream. If chokidar's debounced events and fs.watch's raw events have different temporal characteristics, downstream reducers may behave differently for memory vs code paths.

**Suggested fix:** Add a Task 22a in v2a PR 4 specifying an event-emission contract: "Both watchers debounce file events by 100ms before emitting `content_change`; events carry `{kind, path, sha256, change_type}` with consistent semantics regardless of underlying library." This is a small spec addition that lets v2b reducers consume both streams uniformly.

### P2 — Nits (track but not blocking)

#### P2-1: Wrong line number for k=60 RRF

**Where:** `2026-04-16-memory-v2a-plan.md:12` — "keep RRF (k=60) at `packages/memory/src/scoring.ts:48`."

**Why nit:** k=60 actually appears at lines 41, 65, and 103 of `packages/memory/src/scoring.ts` (verified). Line 48 is mid-comment. v2a Task 10 doesn't depend on the line number being correct — it preserves the file and reuses `rrfScore`/`rrfFuse`. Harmless docstring defect.

**Suggested fix:** Change line 12 to "keep RRF (k=60) in `packages/memory/src/scoring.ts` (`rrfScore` line 41, `rrfScoreWithSparse` line 65, `rrfFuse` line 103)."

#### P2-2: §11.11 (Obsidian graph view) is implicitly assumed by L0 vault writes but never explicitly claimed

**Where:** §11.11: "Opening `{globalDataDir()}/memory/` in Obsidian shows a working graph view with wikilinks resolved, tags navigable, and Dataview queries over frontmatter functional." Per scope-split:106 this is in v2a-AC subset (§11.1-20). Neither plan's task list maps to §11.11.

**Why nit:** Likely satisfied implicitly by v2a PR 1 (memory schema) + PR 6 (typed writes with frontmatter) + the existing vault watcher. But "implicit pass" is fragile — a future schema change could break it.

**Suggested fix:** Add §11.11 to v2a PR 6 Task 29's Maps-to list, with a verify step that opens a representative vault directory in headless Obsidian (or a Dataview-compatible parser) and asserts a non-zero graph.

#### P2-3: v2b plan §11.16 attribution to PR 11 is correct but not present in v2a

**Where:** `2026-04-16-memory-v2b-plan.md:147` — PR 11 Task 2.1 claims §11.16 (supersession edges). Per scope-split:106 §11.16 is v2a. Per scope-split:110 it is NOT in the deferred list.

**Why nit:** §11.16 is the "deep phase produces supersession edges" criterion. Without v2a Dreaming, this is also unsatisfiable in v2a. Bundled into P0-1's resolution.

**Suggested fix:** Resolve via P0-1.

#### P2-4: PCI watcher Task 18 (singleton lock) cites `{globalDataDir()}/project-index-<sha256(realpath)>.lock` but v2a PR 1 doesn't create that path

**Where:** `2026-04-16-memory-v2a-plan.md:190` — Task 18 references the lock path but no PR explicitly creates the `globalDataDir()/project-index-*.lock` directory. Likely auto-created on first write.

**Why nit:** Standard `globalDataDir()` should already exist by PR 1, and `mkdir -p` semantics handle the rest. Cosmetic.

#### P2-5: Effort estimate audit — 9.45h per-host total mismatch

**Where:** `2026-04-16-memory-v2a-plan.md:457` — "Per-Host Correctness PR Cluster (~4h 22m total — Part 08 v2a rows)". Manifest line 36 says "v2a correctness fixes ≈ 4h 22m; v2b enhancements + Copilot ≈ 5h 23m. Total 9h 45m canonical." All match.

**Why nit:** Total adds up; per-PR estimates in v2a (PR 1: 1 week, PR 3: 1 week, PR 4: 1.5–2 weeks, PR 7: 1 week) match manifest line 190-196. v2b PR 10 is 2 weeks per manifest line 204 and v2b plan line 5/72.

## Verification checklist (13 items)

| # | Item | Result | Note |
|---|------|--------|------|
| 1 | Forward compatibility (v2a outputs consumable by v2b) | **PARTIAL FAIL** | Schema rebuild + Kuzu DDL + envelope + scope enum all forward-compat. But Dreaming gap (P0-1) breaks v2b PR 11's stated foundation. |
| 2 | Prerequisite gates explicit + referenced from individual tasks | PASS | Five gates in v2b plan §"Prerequisites"; every PR 10-21 task carries `Prerequisite gate: Gate N` line (verified lines 80-460). |
| 3 | PCI watcher topology supports v2b indexing | PARTIAL FAIL | Architecture Decision #1 asserts reuse, but PR 20 Task 11.1 git path and PR 11 Task 2.2 REM path don't show concrete integration with the watcher event stream — see P1-4 + P1-5. |
| 4 | `FULCRUM_MEMORY_V2=1` flag lifecycle coherent | PASS | v2a PR 1 introduces; v2a Task 34 (line 325) keeps non-primary guard active even when off; v2b PR 21 removes (line 453). v2b architecture decision #5 (line 45) explicit. |
| 5 | No v2b PR silently relies on v2a-deferred work | FAIL | v2b PR 11 line 139 explicitly references "v2a's Dreaming light-phase code" — but v2a defers Dreaming. See P0-1. v2b PR 13 + 14 + 18 are clean per scope-split (Task 4.1 cites PR 10 Task 1.4 dependency; PR 14 doesn't assume v2a LongMemEval; PR 18 has Gate 5). |
| 6 | Sanitize-before-WAL invariant preserved | PASS | v2a PR 5 Task 25 + 26 (lines 250-262) compose `sanitizeOnWrite` first, WAL second. v2b plan critical-constraints #8 carried verbatim (line 66). v2b never modifies WAL ordering. |
| 7 | L0 → L1 → L2 ordering preserved | PASS | v2a PR 1 + PR 6 honor it (Task 1 schema rebuild; Task 29 hook write order via `sanitizeOnWrite → WAL → L0 → L1 → L2 → Kuzu`, line 333). v2b PR 11 Task 2.2 routes through reducer queue (L2 async after REM extraction). |
| 8 | Global-only data rule held in both plans | PASS | Every new path uses `globalDataDir()` — v2a PR 4 Task 18 lock path, PR 5 Task 26 WAL path, PR 9 Task 45 sweep target, v2b PR 12 Task 3.1 global pointer, PR 15 Task 6.3 WAL replay. No project-local writes anywhere. |
| 9 | Context-type NO DEFAULT enforced | PASS | v2a PR 1 Task 3 (line 53) three-step migration ends with NOT NULL + CHECK constraint. PR 6 Task 34 (line 324) silent drop on non-primary. v2b PR 15 Task 6.1 (line 260) audit. v2b never weakens. |
| 10 | Monitor binds loopback in v2b PR 19 | PASS | v2b PR 19 Task 10.1 (line 368) cites loopback-binding invariant + Part 02 line 234. Critical constraint #9 carried. |
| 11 | Rollback operator-only in both plans | PASS | v2a PR 5 Task 28 (line 271) registers as CLI command, NOT in action surface; explicit test at line 274 asserts MCP tool list does not contain `memory_rollback`. v2b PR 15 Task 6.3 follows same pattern. |
| 12 | Effort estimates match manifest revisions | PASS | v2a PR 1: 1 week ✓; PR 3: 1 week ✓; PR 4: 1.5–2 weeks ✓; PR 7: 1 week ✓; v2b PR 10: 2 weeks ✓ (per manifest lines 190-204). |
| 13 | AC mapping completeness (no orphans, no double-claims) | FAIL | §11.9 orphaned (P1-1). §11.32 double-claimed in conflict with scope-split (P0-2). §11.50 same (P0-3). §11.5/§11.14/§11.15/§11.16 unsatisfiable in v2a (rolls into P0-1). §11.11 implicitly assumed (P2-2). |

**Pass rate: 8 PASS / 2 PARTIAL FAIL / 3 FAIL = 8/13.**

## Acceptance criteria coverage audit

**v2a-claimed ACs (per scope-split:106 + 108):** §11.1-10, 11.12-20, 11.21-28, 11.30, 11.33, 11.34, 11.36-46, 11.62, 11.64, 11.67-70.

**Coverage status (only flagging defects):**

| AC | Scope-split assignment | v2a plan | v2b plan | Status |
|----|------------------------|----------|----------|--------|
| §11.5 | v2a (Dreaming deep-phase promotion) | NOT CLAIMED | claimed by PR 11 as "carry-forward" | **ORPHAN in v2a** (P0-1) |
| §11.9 | v2a (Pi cockpit file_patch) | NOT CLAIMED | not claimed | **ORPHAN** (P1-1) |
| §11.11 | v2a (Obsidian graph view) | NOT CLAIMED | not claimed | **ORPHAN, implicit-only** (P2-2) |
| §11.14 | v2a (post-Dreaming embedded flag) | claimed by PR 1 Task 1 | not claimed | **CLAIMED but unsatisfiable** (P0-1) |
| §11.15 | v2a (Dreaming light dangling-link report) | NOT CLAIMED | not claimed | **ORPHAN, dependency on Dreaming** (P0-1) |
| §11.16 | v2a (Dreaming deep supersession edges) | NOT CLAIMED | claimed by PR 11 Task 2.1 | **MIS-ATTRIBUTED** (P0-1, P2-3) |
| §11.32 | v2b (WAL replay) | claimed by PR 5 Task 26 | claimed by PR 15 Tasks 6.1+6.3 | **DOUBLE-CLAIMED, scope violation** (P0-2) |
| §11.50 | v2b (prose covers docs + graph edges) | claimed by PR 1 Task 5 + PR 3 Task 15 + PR 4 Task 21 | claimed by PR 20 Task 11.6 | **DOUBLE-CLAIMED, scope violation** (P0-3) |

**Legitimate carry-forward (both plans claim, but each labels the layer they own):** §11.20, §11.23, §11.26, §11.40, §11.44, §11.46, §11.64, §11.67. These are correctly scoped (v2a establishes; v2b extends). No defect.

## Forward-compatibility audit (v2a outputs that v2b consumes)

| v2a artifact | v2b consumer | Status |
|--------------|--------------|--------|
| `memories` table rebuild (PR 1) — schema_version + normalize_version + slug + vault_path + tier + scope enum widened | v2b extends app-level `validateKind` + adds `scope='global'` only (no schema change) | **PASS** — additive only |
| Kuzu DDLs PR 7 (Memory + Entity + File + CodeChunk + Symbol nodes; 7 rel tables) | v2b PR 10 adds 17 node types + ~25 rel tables via `buildControlPlaneDDL` + `buildGitDDL`, all additive (line 100-105) | **PASS** — no rebuilds |
| `{results, reason?}` envelope on recall actions (PR 2 Task 11) | v2b `code_context` + `project_context` (PR 13) consume same envelope; PR 12 Task 3.4 returns `{results: [], reason: "no_pointer_match"}` | **PASS** |
| Persisted session-scope (`scope='session'`+`session_id`+`expires_at`, PR 1 Tasks 2 + 4 + Task 45 sweep) | v2b PR 12 adds `scope='global'` to enum; v2b decision #6 (line 46) explicit | **PASS** |
| WAL with sha256-only redaction (PR 5) | v2b PR 14 Task 5.x can use WAL for regression replay; PR 15 Task 6.3 adds `replay-wal` | **PASS** |
| PCI watcher (`packages/memory/src/pci/watcher.ts`, PR 4) | v2b architecture decision #1 reuses; but git reducer + REM event integration unspecified | **PARTIAL FAIL** (P1-4, P1-5) |
| Action surface registry (PR 9) | v2b PR 13 Task 4.3 registers `code_context`/`project_context` in same `tool-registry.ts` | **PASS** |
| `agent-integration/skills/` canonical tree + symlinks (PR per-host cluster Task 46) | v2b PR 18 Task 9.3 symlinks Copilot into the same tree | **PASS** |
| Dreaming light-phase code (per v2b PR 11 line 139 expectation) | v2b PR 11 reframes into REM | **FAIL — v2a never ships this** (P0-1) |
| `fulcrum dream` CLI (implicit prerequisite for v2b PR 11 verify step) | v2b PR 11 Task 2.1 verify uses `fulcrum dream --phase=REM` | **FAIL — neither plan ships the CLI** (P1-2) |

## Effort estimate audit

| PR | Plan estimate | Manifest estimate | Match? |
|----|---------------|-------------------|--------|
| v2a PR 1 | 1 week | ~1 week (manifest:190) | YES |
| v2a PR 2 | 3 days | 3 days (manifest:191) | YES |
| v2a PR 3 | 1 week | ~1 week (manifest:192) | YES |
| v2a PR 4 | 1.5–2 weeks | ~1.5–2 weeks (manifest:193) | YES |
| v2a PR 5 | 2 days | 2 days (manifest:194) | YES |
| v2a PR 6 | 3 days | 3 days (manifest:195) | YES |
| v2a PR 7 | 1 week | ~1 week (manifest:196) | YES |
| v2a PR 8 | 3 days | 3 days (manifest:197) | YES |
| v2a PR 9 | 3 days | (manifest PR 9 = PreCompact, 3 days; v2a plan PR 9 = action-surface finalization with PreCompact moved to PR 6 Task 32) | DRIFT — v2a plan reorganized but kept same total |
| v2a per-host cluster | ~4h 22m | ~4h 22m (manifest:36) | YES |
| v2b PR 10 | ~2 weeks | ~2 weeks (manifest:204) | YES |
| v2b PR 11 | ~1 week | 1 week (manifest:205) | YES — but understated if v2a doesn't ship light phase (P0-1, P1-2) |
| v2b PR 13 | ~4 days | 4 days (manifest:207) | YES |
| v2b PR 14 | ~1 week | ~1 week (manifest:208) | YES |
| v2b PR 17 | ~5h 23m | ~5h 23m (manifest:36) | YES |
| v2b PR 18 | ~2h | ~2h (manifest:212) | YES |
| v2b PR 19 | ~1 week | ~1 week (manifest:213) | YES |
| v2b PR 20 | ~1 week | ~1 week (manifest:214) | YES |

No understatements found except for the conditional one on PR 11 (depends on P0-1 resolution).

## Open items raised by review (not addressed by either plan)

1. **Reducer collision between v2a PR 7 Task 38 (`reducers/memory.ts`) and v2b PR 11 Task 2.2 / PR 10 Task 1.5 (central reducer registry).** v2b plan should explicitly state whether v2a's standalone memory reducer gets refactored into the registry in PR 10, or whether they coexist with edge-write idempotency guarantees. (P1-3)

2. **Watcher event-emission contract.** v2a PR 4 Task 22 dedupes paths but doesn't specify temporal/payload semantics that v2b reducers depend on. Should be specified once in v2a so v2b consumers can rely on it. (P1-5)

3. **§11.32 — does v2a PR 5's WAL **structure** satisfy the AC's "ensure WAL structure supports it" caveat?** The AC text in Part 07 line 52 reads: "Writing a memory, losing L1, and running `fulcrum memory replay-wal` re-derives the row from the WAL + L0 vault." This requires the command, which is v2b. v2a's WAL structure doesn't satisfy the AC by itself. The scope-split caveat ("ensure WAL structure supports it") is a future-proof nudge, not a v2a deliverable. Plan tables should reflect this.

4. **`fulcrum dream` CLI surface ownership.** Neither plan creates this CLI command, yet v2b PR 11 verify step uses it. Either v2a Dreaming PR (if added per P0-1 fix-a) ships it, or v2b PR 11 grows a Task 2.0 to add it.

5. **Cypher allowlist depth limit (already surfaced as v2b open question #2 line 526).** Worth elevating to a Gate-2.5 or pre-PR-19 decision rather than leaving as a runtime decision.

6. **Identity decision (Gate 2) re-sequencing implication is vague.** v2b plan line 524 says "if AGENTS.md wins authority, the Phase ordering above must be re-shuffled before drafting begins." But there's no contingency plan B — no alternate phase order documented. If user picks AGENTS.md-wins, planning has to redo v2b mid-stream. Worth pre-drafting both orderings.
