# Document Review (headless): Memory v2a Plan

Plan reviewed: `/home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-16-memory-v2a-plan.md` (576 lines, 52 tasks).

## Verdict

**Amber.** Architecture and scope discipline are sound; the per-PR file-level work is implementable and grounded. However, several AC mappings are wrong (some load-bearing), one source-doc contradiction about Dreaming-in-v2a is silently resolved against scope-split.md, and two design defects (sweep-from-refcounted-singleton; PR 4 "zero-activation productive" claim before PR 6 lands) will bite during build. Fix the P0s before approval.

## Findings

### P0 — Blocking (must fix before user approves)

#### F-P0-1 — Source-doc contradiction: Dreaming ACs land in v2a per scope-split, but plan ships no Dreaming PR
- Lens: Coherence + Scope guardian
- Where: plan:43 (Task 1 claims §11.14); plan:1–576 (no Dreaming PR exists); `00-scope-split.md:106` lists §11.5, §11.14, §11.15, §11.16 (all Dreaming ACs) as in-scope for v2a; source inventory §"Integration Order" line 205 puts Dreaming at v2b PR 11.
- Why blocking: Task 1's acceptance criteria does not produce §11.14 ("every durable entry has embedded=1 after Dreaming deep phase completes"); it only adds the `embedded` column. The plan implicitly defers Dreaming to v2b (no PR 10/11 in v2a), which conflicts with the scope-split's AC subset on line 106 (§11.5 with updated thresholds, §11.15, §11.16). Either (a) the AC list in `00-scope-split.md` is wrong and v2a really does not own these ACs, or (b) v2a needs a Dreaming PR. The plan picked (a) silently and mis-claimed §11.14 on Task 1 to paper over it.
- Suggested fix: explicitly state in Plan §"Open Questions Surface" that Dreaming ACs §11.5/§11.14/§11.15/§11.16 are deferred to v2b per copy-file-manifest line 205, and ask the user to update `00-scope-split.md:106` to remove them. Drop §11.14 from Task 1's "Maps to AC" line.

#### F-P0-2 — Wrong AC mapping: Task 8 (git-files lift) claims §11.22 (cross-process safety), which is owned by Task 18 (singleton + lock)
- Lens: Coherence
- Where: plan:92 (`Maps to AC: §11.21, §11.22`); §11.22 verified in `07-acceptance-and-planning.md:42` ("Starting a second `fulcrum serve mcp` ... does NOT start a second watcher; ... Lock file at `{globalDataDir()}/project-index-<hash>.lock`...").
- Why blocking: Task 8 lifts `git-files.ts` + `hash.ts`. Neither implements cross-process safety. The real owner is Task 18 plan:193 (which does map §11.22, correctly).
- Suggested fix: remove §11.22 from Task 8's Maps line.

#### F-P0-3 — Wrong AC mapping: Task 28 (rollback CLI gate) claims §11.42 (policy rules), which is unrelated
- Lens: Coherence
- Where: plan:275 (`Maps to AC: §11.42, §11.44`); §11.42 verified in `07-acceptance-and-planning.md:62` ("Policy rules are all defined; `enabled` is the only knob...").
- Why blocking: Rollback is not a policy-rule registry. §11.42 has no v2a owner. This means the v2a deliverable for §11.42 is invisible.
- Suggested fix: remove §11.42 from Task 28; either add a new task for `fulcrum policy rules list/enable/disable` OR explicitly defer §11.42 in the Open Questions surface (note: scope-split line 106 includes §11.42 in v2a, so deferral needs user sign-off).

#### F-P0-4 — Wrong AC mapping: Task 45 (sweep-expired) claims §11.36/§11.37, which are cold-install / no-auto-activation invariants
- Lens: Coherence
- Where: plan:448 (`Maps to AC: §11.36, §11.37`); §11.36 verified in `07-acceptance-and-planning.md:56` ("Cold install works end-to-end..."); §11.37 verified at line 57 ("No auto-activation. Starting the MCP server never creates a task...").
- Why blocking: Sweeping expired session-scope rows is unrelated to cold-install correctness. §11.36/§11.37 are invariants that emerge from PR 4 (cold install runs PCI) + PR 9 + the per-host correctness cluster, not from a TTL sweep. Worse: Task 45 is the *only* place §11.36/§11.37 are mapped in v2a — meaning the plan claims a TTL sweep satisfies cold-install zero-activation, which it does not.
- Suggested fix: remap Task 45's AC line to whatever scope-split actually wants from session-TTL (likely a forward-compat note, not an AC). Add a new Checkpoint-level acceptance that captures §11.36/§11.37 as integration tests run after the PR 4 + per-host cluster lands.

#### F-P0-5 — Wrong AC mapping: Task 43 claims §11.40 (project_context shape-stable), but Task 44 is the real owner
- Lens: Coherence
- Where: plan:434 (Task 43 Maps line includes §11.40); plan:441 (Task 44 Maps line is §11.40 only). Task 43 registers `recall_memory`/`query_memory`/`search_code`; §11.40 is about `project_context` (deferred to v2b but shape-stable).
- Why blocking: Double-claim creates ambiguity about which task fails CI when §11.40 regresses.
- Suggested fix: remove §11.40 from Task 43's Maps line; leave it solely on Task 44.

#### F-P0-6 — Scope drift: Task 26 (WAL writer) claims §11.32 (WAL replay), which `00-scope-split.md:110` defers to v2b
- Lens: Scope guardian
- Where: plan:261 (Task 26 Maps line: §11.32, §11.34); `00-scope-split.md:110` ("Deferred to v2b: ... §11.32 (WAL replay — stay as future capability; ensure WAL structure supports it...)").
- Why blocking: Plan implicitly promises a working `fulcrum memory replay-wal` in v2a (the §11.32 AC text in `07-acceptance-and-planning.md:52` is "Writing a memory, losing L1, and running `fulcrum memory replay-wal` re-derives the row"). Task 26 only writes the WAL; replay tooling is nowhere in the plan. Accepting §11.32 as a v2a AC creates an undeliverable.
- Suggested fix: remove §11.32 from Task 26's Maps line and from the PR 5 row in the Per-PR Acceptance Gates table (plan:528). Add an Open Question note that §11.32 stays deferred and v2a only commits to "WAL structure supports replay" (which Task 26 does deliver).

#### F-P0-7 — PR 4 Checkpoint overclaim: "cold install is zero-activation productive — typed memory + code index both running" before PR 6 lands
- Lens: Feasibility + Coherence
- Where: plan:237 ("After PR 4 merges, cold install is zero-activation productive — typed memory + code index both running").
- Why blocking: PR 4 ships the PCI watcher + code index. Typed memory (`file_patch`, `bash_trace`, `pre_compact_extract`, etc.) does not exist until PR 6 (Task 29 plan:289 onward). Until PR 6, `runPostHook` writes the existing untyped parameter-key payloads, which is exactly the failure mode the v2a effort is built to fix. The checkpoint statement, taken literally, says PR 4 closes the stated problem — it does not.
- Suggested fix: rewrite the bullet to "After PR 4 merges, code index runs cold-install zero-activation; typed memory writes land in PR 6." Move the "cold-install zero-activation productive" milestone to the PR 6 checkpoint (plan:331) or to a new "After PR 6" checkpoint.

#### F-P0-8 — Sweep singleton design defect: 24h timer hosted in a refcounted PCI singleton with 30s teardown grace
- Lens: Adversarial + Feasibility
- Where: plan:16 ("daily sweep job ... runs from the same singleton process that owns the watcher"); plan:444–448 (Task 45 implementation); plan:190 (Task 18: refcount → 0 + 30s grace → tear-down).
- Why blocking: When no agent run is active, the PCI singleton tears down after 30s. A 24h timer hosted on that singleton fires only if at least one agent run is active continuously across 24 hours, which is a degenerate case. In normal multi-session use the sweep never runs and `expires_at` rows accumulate forever — defeating the purpose of session-scope TTL.
- Suggested fix: either (a) host the sweep in the MCP server lifecycle (which Task 20 plan:204 says holds a top-level handle while serving) and gate it on "if MCP is the running process," or (b) sweep on every `start_agent_run` (cheap idempotent DELETE, predicate-indexed), or (c) install a system-level cron via `--install` flag and remove the in-process timer entirely. Pick one and document.

### P1 — Important (should fix before merge approval)

#### F-P1-1 — Missing AC owners: §11.5, §11.9, §11.11, §11.15, §11.16, §11.43 are listed as v2a in scope-split.md but no task in the plan claims them
- Lens: Coherence
- Where: plan-wide (no Maps line references §11.5/§11.9/§11.11/§11.15/§11.16/§11.43); `00-scope-split.md:106` enumerates all six as v2a-in-scope.
- Why important: Five of these are Dreaming-related (already covered by F-P0-1). §11.9 (Pi cockpit writes file_patch via recall_memory) and §11.11 (Obsidian graph view) are independent. §11.43 (`list_activations` MCP tool) is a discrete deliverable not anywhere in the plan.
- Suggested fix: explicitly add §11.43 task or defer in Open Questions; add §11.9 as an integration AC under Task 51 (Pi cockpit CLI); add §11.11 as a Checkpoint-level smoke test (open vault in Obsidian; verify graph + dataview).

#### F-P1-2 — `scope='global'` ambiguity: kept in CHECK constraint "for forward-compat" but plan never says what v2a does when an agent writes it
- Lens: Coherence + Scope guardian
- Where: plan:47 (Task 2: "keep `'global'` (for forward-compat with v2b)"); `00-scope-split.md:90` ("Excluded from v2a: `scope: 'global'`").
- Why important: Two readers will diverge — one will assume writes succeed silently, another will assume they error or get remapped. v2b PR 12 expects `scope='global'` to be authorised via role policy, but v2a has no such gate.
- Suggested fix: spell out the v2a behavior. Recommended: writes with `scope='global'` are accepted into the schema but recall actions filter them out (treat as workspace-scoped at recall time), with a non-blocking warning logged.

#### F-P1-3 — Chokidar terminology drift between PCI and rename heuristic
- Lens: Coherence
- Where: plan:9 ("Chokidar is rejected for the PCI source watcher because `fs.watch(recursive:true)` ..."); plan:561 ("accept chokidar's 500ms heuristic for v2a; periodic git-rename sweep is v2b"); plan:197 (Task 19: "rename (chokidar-style `unlink+add` within 500ms) detected by body-hash match").
- Why important: PCI uses raw `fs.watch` not chokidar. The "500ms heuristic" originated in chokidar, but in v2a it is reimplemented inside the syncer. The phrase "chokidar's 500ms heuristic" in the Open Questions misleads — a reader may infer chokidar is used somewhere in PCI.
- Suggested fix: rename to "the 500ms unlink-then-add rename heuristic (originally from chokidar; reimplemented in `pci/syncer.ts`)."

#### F-P1-4 — `fs.watch` topology fragile on network mounts / FUSE / overlay / junctions; plan has no fallback
- Lens: Adversarial + Feasibility
- Where: plan:9 (PCI watcher topology decision); plan:182 (Task 17 acceptance).
- Why important: per-dir non-recursive `fs.watch` on NFS, smbfs, sshfs, FUSE, and Windows junction points has documented gaps — events are silently dropped or never delivered. prior-art ships a Linux/macOS bias. Fulcrum users on remote-dev rigs (Codespaces, Devcontainers, NFS-mounted homedirs) will see "code index ate my changes" without telemetry. The PR 4 checkpoint claims "survives large repos without exhausting inotify" but does not claim "survives unsupported filesystems."
- Suggested fix: add Task in PR 4 cluster (or as a follow-on AC) to detect unsupported FS via `statvfs`/`statfs` `f_basetype` or platform probe at watch init, log a warning, and fall back to a periodic full rescan (e.g., every 5 minutes) instead of pretending to watch. Document supported filesystems in the rollback guide.

#### F-P1-5 — Task 9 partial coverage of §11.1: validates `kind` only, not `tier` and `provenance` non-NULL together
- Lens: Coherence
- Where: plan:99 (Task 9 maps §11.1); §11.1 verified in `07-acceptance-and-planning.md:21` ("Every hook write in §1 produces a row with non-NULL `kind`, `tier`, and `provenance` when flag is on").
- Why important: §11.1 is a tri-conjunctive AC. Task 1 plan:40 makes `tier` NOT NULL with default and `provenance` NOT NULL with default `'{}'` — schema-wise satisfied. Task 29 plan:290 emits typed `file_patch` writes with full provenance — runtime-wise satisfied. But there is no single test that asserts all three for "every hook write" — Task 9's test only covers kind validation. CI gap.
- Suggested fix: add an integration test (or expand Task 29's `hooks-file-patch.test.ts`) that asserts every hook write path produces a row with all three non-NULL + non-empty `provenance` JSON.

#### F-P1-6 — WAL fail-then-proceed contradicts §11.32 even partial-shape promise; non-WAL'd writes cannot be replayed
- Lens: Adversarial + Security
- Where: plan:258 (Task 26 acceptance: "WAL append failure does NOT block the write — error logged, write proceeds").
- Why important: Tied to F-P0-6. Even if §11.32 is properly deferred to v2b, the choice to proceed-on-WAL-failure produces L0/L1 rows with no audit trail. This breaks the "WAL records all v2a writes" handoff promise on plan:572 and weakens the audit story the rest of the plan leans on (constraint #8 sanitize-before-WAL is moot if WAL is missing entirely).
- Suggested fix: tighten to "WAL append failure with sync errno (ENOSPC, EROFS, EIO) blocks the write; transient failures (e.g., contention) retry once before logging-and-proceeding." Update plan:572 handoff note to reflect "WAL records all successful v2a writes; failed-WAL writes are dropped, not silently persisted."

#### F-P1-7 — `scoring.ts:48` line cite is wrong; actual `k = 60` is at scoring.ts:41 (and 65, 103)
- Lens: Coherence (citation accuracy)
- Where: plan:12 ("keep RRF (k=60) at `packages/memory/src/scoring.ts:48`"); verified `k = 60` at scoring.ts:41,65,103 — none at line 48.
- Why important: low-stakes, but the plan emphasises "cite file paths + line numbers" per handover strict rule #7. Wrong line number tells a reader the plan was not verified.
- Suggested fix: change to `scoring.ts:41` (primary) or "`scoring.ts` (lines 41, 65, 103)."

#### F-P1-8 — Stop-hook race against `update_task` is acknowledged but not mitigated
- Lens: Adversarial
- Where: plan:303–308 (Task 31: "If zero rows → write `kind='session_summary'`. If ≥1 row → skip"); plan:393 (Task 39 race-guard depends on Task 31 reading).
- Why important: If `update_task(status=completed)` and Stop fire concurrently (e.g., Stop fires while update_task is mid-INSERT), Task 31's check sees 0 rows and writes `session_summary`; Task 39 then writes `task_outcome`. §11.7 demands "exactly one of `task_outcome` or `session_summary` (not both)."
- Suggested fix: serialise the check+insert via a SQLite UNIQUE index on `(run_id, kind IN ('task_outcome','blocker_resolution','session_summary'))` partial unique, OR run Task 31's check inside an EXCLUSIVE transaction that holds until insert.

#### F-P1-9 — Bash read-only detection list is a denylist masquerading as an allowlist; impossible to maintain
- Lens: Adversarial
- Where: plan:297 (Task 30: "Read-only commands (`ls`, `cat`, `pwd`, `git status`, `which`, `head`, `tail`, `grep` without redirection) skipped").
- Why important: The list is incomplete (`stat`, `file`, `find -name -print`, `tree`, `wc -l`, `awk '/.../'`, `sed -n '...p'`, `jq`, `du`, `df`, `ps`, `top`, `whoami`, `id`, `uname`, etc. all read-only). Detecting "redirection" reliably from a tool_input string is itself a parsing problem. This produces noise on every typical session.
- Suggested fix: invert the model — write `bash_trace` only for commands matching a small allowlist of mutating verbs (`rm`, `mv`, `cp`, `mkdir`, `chmod`, `chown`, `npm`, `pnpm`, `git commit/push/merge/rebase/checkout/branch -D`, etc.) plus any command containing `>`, `>>`, `|`, `&&`, `;` followed by a mutating verb. Document the rule explicitly in the test.

### P2 — Nits (track, not blocking)

#### F-P2-1 — Plan section "Per-PR Acceptance Gates" table inherits the upstream wrong AC mappings
- Lens: Coherence
- Where: plan:524–533. Once F-P0-2/3/4/5/6 are fixed at the task level, the table needs the same edits.

#### F-P2-2 — "9 PRs" in title vs 10 PR rows including per-host cluster
- Lens: Coherence (minor)
- Where: plan title overview line 5 "8 PRs" implied by "1.5 weeks for two with parallel PRs"; the body has 9 numbered PRs plus a per-host cluster (10 surfaces). Consistency: scope-split.md and copy-file-manifest both call it "9 PRs (PRs 1–9) plus per-host cluster" — plan body matches that, only the prose summary glosses it as "8 PRs."
- Suggested fix: rephrase plan:5 to "9 PRs plus a parallelizable per-host correctness cluster."

#### F-P2-3 — Task 7's verify command runs a single test file but Task 7 introduces nine new files
- Lens: Coherence (test coverage)
- Where: plan:83 ("Verify: ... `src/tests/tier-a-lift.test.ts`").
- Why nit: A single round-trip test per nine modules is thin. Expected — Tier A is verbatim — but worth a comment that lift-tests are smoke-only and full coverage rides on the modules that consume them.

#### F-P2-4 — "L0 → L1 → L2 (durable only)" wording in Task 26 / PR 6 Checkpoint may confuse
- Lens: Coherence (terminology)
- Where: plan:333. Constraint #2 says all writes are L0→L1→L2; the "(durable only)" parenthetical refers to embedding (only durable rows embed), but new readers will read it as "L2 step is skipped for short-term."
- Suggested fix: rephrase as "L0 → L1 → L2 (L2 embedding gated to durable tier; Kuzu reducer runs for all)."

#### F-P2-5 — `provenance.run_id` query in Task 31 assumes JSON1 path syntax that current `memories` schema doesn't index
- Lens: Feasibility (perf)
- Where: plan:304 ("`memories WHERE provenance.run_id = current_run_id AND kind IN ('task_outcome','blocker_resolution')`"). The Task 1 schema (plan:40) adds `provenance TEXT NOT NULL DEFAULT '{}'` — a TEXT JSON blob. SQLite JSON path queries (`json_extract(provenance, '$.run_id')`) work but cannot use B-tree indexes without an expression index.
- Suggested fix: add an expression index `CREATE INDEX idx_memories_provenance_run_id ON memories(json_extract(provenance, '$.run_id'))` to Task 1's DDL list, or extract `run_id` to a top-level column populated by Task 29's writer.

#### F-P2-6 — Plan does not state how the PCI singleton coordinates with `realpathSync` symlink resolution under macOS `/var → /private/var`
- Lens: Adversarial (minor)
- Where: plan:190 (Task 18 lock at `realpathSync(projectRoot)`).
- Why nit: macOS resolves `/tmp` → `/private/tmp`. If two callers pass `/tmp/proj` and `/private/tmp/proj`, both will hash the same `realpath` — correct. But if symlinks change mid-session (rare), refcount becomes inconsistent. Not blocking; document.

## Auto-applied fixes

(none — sibling review file only; plan untouched per strict rules)

## Lens summary

- **Coherence:** 6 findings (F-P0-1, F-P0-2, F-P0-3, F-P0-4, F-P0-5, F-P0-7 + P1/P2 chains). Multiple AC mis-mappings; one source-doc contradiction silently resolved; one milestone overclaim.
- **Feasibility:** 3 findings (F-P0-7, F-P0-8, F-P1-4 + P2-5). Sweep timer hosted on refcounted singleton; FS-watch on unsupported mounts; JSON-path query without expression index.
- **Scope guardian:** 2 findings (F-P0-1, F-P0-6, F-P1-2). Dreaming ACs claimed but no Dreaming PR; §11.32 deferred per scope-split but mapped in plan; `scope='global'` behavior ambiguous.
- **Security:** 1 finding (F-P1-6). Sanitize-before-WAL invariant preserved (plan:17, plan:258); operator-only rollback preserved (plan:18, plan:271); loopback monitor preserved (plan:225); context-type NO DEFAULT preserved (plan:54); but WAL-fail-and-proceed weakens audit chain.
- **Adversarial:** 4 findings (F-P0-8, F-P1-4, F-P1-8, F-P1-9). Sweep dies with singleton; FS-watch on FUSE/NFS; Stop-hook race; bash denylist trivially escapable.
- **Project standards:** clean. Plan honors global-only data (Task 18 plan:190 uses `globalDataDir()`), L0→L1→L2 ordering (constraint #2 plan:23 + Task 26 plan:258), full-64 sha256 (plan:24, no truncation cited). CLI-first primary with MCP overlay preserved throughout.
