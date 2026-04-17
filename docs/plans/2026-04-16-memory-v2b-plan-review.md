# Document Review (headless): Memory v2b Roadmap

## Verdict

**Amber** — plan is well-structured and lens-aware, but inherits one load-bearing source contradiction (Dreaming v2a-vs-v2b), hand-waves the Gate 2 AGENTS.md-wins re-shuffle, and contains several invented thresholds + AC mis-citations that need closing before user approval.

## Findings

### P0 — Blocking (must fix before user approves)

**P0-1 / Coherence + Scope guardian / Dreaming scope contradiction inherited silently / plan:138-163 (Phase 2, PR 11) and plan:472, plan:489**
- Source-of-truth conflict the plan does not flag:
  - `00-scope-split.md:57` and `:63` list "Dreaming light / REM / deep phases (§8 — Part 06)" under v2a "What v2a ships". Manifest B.4 promotion ranker is also called out in v2a PR 1's Tier A copy set (`00-scope-split.md:116`).
  - `2026-04-16-memory-v2-copy-file-manifest.md:205` tags "PR 11 — Dreaming" as `[v2b]`.
- The plan silently picks the manifest position (Dreaming = v2b) at Phase 2 / PR 11 / Task 2.1 (`fulcrum dream --phase=REM` lives in v2b).
- Why blocking: Gate 1 ("v2a baked ≥2 weeks without rollback") is meaningless if "what v2a ships" has two contradictory answers. Also, plan:472 cites "§11.5 carry-forward" against PR 11 — but §11.5 (`07-acceptance-and-planning.md:25`) is the Dreaming deep-phase promotion AC, which the scope-split says ships in v2a. If v2a never built it, "carry-forward" is fiction. Conversely, if v2a did build it, PR 11 in v2b is double-building.
- Suggested fix: surface the conflict explicitly in the "Cross-plan handoff" section. Decide one of: (a) v2a ships only Dreaming light + supersession scaffolding; v2b adds REM-into-Kuzu + procedural proposals + global pointer (current plan implicitly assumes this, but scope-split needs the matching edit); or (b) full Dreaming ships in v2a, and Phase 2 of v2b becomes only the Kuzu-integration delta. Either way, edit `00-scope-split.md` lines 57+63 to match, and rephrase PR 11 acceptance to call out the v2a/v2b split inside Dreaming itself.

**P0-2 / Adversarial / Gate 2 "AGENTS.md-wins" re-shuffle is hand-wave / plan:524**
- Open Question #1 says "if AGENTS.md wins authority, PR 10 (control-plane graph) becomes the v2b headline, and PRs 13 / 19 / 20 (which consume the graph) move earlier in the sequence; PRs 11 / 12 / 14 (memory-side enhancements) move later."
- But PR 10 is *already* the headline (Phase 1, plan:72). The "move earlier" claim is vacuous. PR 13 / 19 / 20 already depend on PR 10 by the dependency graph (plan:374, plan:391, plan:411, plan:418, plan:425) and so cannot move ahead of it. The plan never spells out what the alternate Phase ordering actually is.
- Why blocking: Gate 2 is described as a true blocker; if the user decides AGENTS.md-wins, this plan offers no concrete re-sequenced PR list to execute against. The "Phase ordering above must be re-shuffled before drafting begins" sentence shifts the work onto a future planner without giving them a starting point.
- Suggested fix: write the alternate Phase ordering in the same Open Question entry — e.g., "AGENTS.md-wins ordering = Phase 1 (PR 10) → Phase 4 (PR 13) → Phase 10 (PR 19) → Phase 11 (PR 20) → Phase 2 (PR 11) → Phase 3 (PR 12) → Phase 5 (PR 14) → remaining". Or explicitly accept that title-wins is the planning default and AGENTS.md-wins triggers a re-plan, not a re-shuffle.

**P0-3 / Adversarial + Feasibility / Gate 3 "<5% promotion rate" threshold invented / plan:23-24**
- Plan: "Pass: §12.2 offline sweep run on imported sessions; promotion-rate report produced; thresholds tuned if rate <5%." and "rate <5% AND thresholds unchanged → rework thresholds before PR 11 deep-phase code lands."
- Sources cited (handover `Review findings still open` adversarial F3, Part 06 §8 line 57, manifest B.4) do NOT specify 5%. The handover says "If <5% promotion rate, rework thresholds before the deep-phase code lands" — that 5% was inherited from the handover but the handover is itself the inventor, with no upstream basis.
- The escalation path is unspecified: who tunes, what threshold ranges to try, what happens if even tuned thresholds yield <5% (do we ship Dreaming with a degraded mode, or block PR 11 indefinitely?).
- Why blocking: Gate 3 is the only thing standing between Phase 2 and a known-broken Dreaming pipeline on code-agent workloads (per adversarial F3). A vague gate is not a gate.
- Suggested fix: replace `<5%` with either (a) "promotion rate report flagged for explicit user approval before PR 11 starts" (no numeric threshold, human-judgment gate) or (b) a defended numeric (e.g., "rate must exceed the median of the v2a short-term-tier recall_count distribution"). Add an explicit escalation clause: if tuning fails, the gate stays closed and PR 11 is rescoped to "promotion-pipeline scaffolding without cron".

### P1 — Important

**P1-1 / Scope guardian / §11.64, §11.67, §11.69 double-booked between v2a and v2b / plan:329, plan:354, plan:289 vs scope-split:108**
- `00-scope-split.md:108` lists "§11.64 (OpenCode event subs), §11.67 (shared skills deployed), §11.69 (Pi npm), §11.70 (dead artifacts removed)" under "v2a-specific host-correctness criteria from Part 08".
- This plan re-claims them as v2b ACs:
  - Task 8.4 (plan:329) maps to §11.64.
  - Task 9.3 (plan:354) maps to §11.67 (annotated as carry-forward, but still claimed).
  - Task 7.2 (plan:296) and PR 16 row (plan:477) map to §11.69.
- Compounded by an *internal* scope-split contradiction at `00-scope-split.md:167` which lists "`fulcrum-cockpit` published to npm" as v2a-NOT-included, contradicting the same doc's :108 listing of §11.69 under v2a.
- Why important: the v2a/v2b boundary is the one thing the plan is supposed to honor. Either v2a ships these (and plan must drop the duplicate v2b tasks), or v2a doesn't (and `00-scope-split.md:108` is wrong).
- Suggested fix: surface this as a pre-existing source inconsistency in the "Cross-plan handoff" section; do not silently absorb. Recommend: §11.69 (Pi npm publish) and §11.67 (shared skills symlinks for new hosts only — i.e., Copilot) are v2b; §11.64 (OpenCode event subs) and §11.70 (dead-artifact removal) are v2a per scope-split:108. Edit `00-scope-split.md:108` and `:167` to match.

**P1-2 / Coherence / Task 1.1 node-count off-by-one / plan:77**
- Acceptance text: "DDL for 17 new node types (`task`, `agent_run`, `team_instance`, `team_template`, `team_members` (modeled as edge — see Task 1.3), `workflow_run`, `handoff`, `artifact`, `review`, `worktree`, `epic`, `issue`, `prd`, `plan`, `external_ref`, `agent_adapter`, `artifact_contract`, `notification_event`, `policy_event`)".
- Counting names excluding `team_members` (which the parenthetical correctly removes): task, agent_run, team_instance, team_template, workflow_run, handoff, artifact, review, worktree, epic, issue, prd, plan, external_ref, agent_adapter, artifact_contract, notification_event, policy_event = **18 nodes**.
- Text says 17.
- Why important: the verify step (`asserts each DDL parses`) is a count-the-tables check; an off-by-one will fail that test or be silently allowed depending on how it's coded.
- Suggested fix: change "17 new node types" → "18 new node types" or remove one (e.g., `policy_event` is already grouped with event nodes per `02-activation-and-inventory.md:260`; consider whether it belongs in `buildControlPlaneDDL` or in a separate event-node DDL group). Cross-check against scope-split:181 which lists 24 v2b node types.

**P1-3 / Adversarial / Kuzu DDL composition with v2a seed never verified / plan:101 + plan:503**
- Architecture decision #4 (plan:44) and Cross-plan handoff #2 (plan:503) both assert that v2a's `buildAllDDL(dims)` is extended in v2b "no rebuild needed". But neither references actual v2a PR 7 code that doesn't exist yet (v2a is unshipped), and Kuzu's `CREATE NODE TABLE`/`CREATE REL TABLE` semantics for additive DDL under a populated DB are not cited.
- Adversarial F1 was the trigger for the v2a/v2b split. Re-introducing an unverified Kuzu-additive-DDL claim re-creates the same falsification risk that triggered the split.
- Suggested fix: add an entry to the Risk Register saying "Kuzu DDL extension assumed additive; verify by running v2a's `buildAllDDL` then v2b's `buildAllDDL` against a populated v2a Kuzu DB before PR 10 acceptance is signed off." Add this as a sub-task under PR 10 Task 1.4.

**P1-4 / Coherence / PR 10 Task 1.5 cites prior art failure-isolation but the requirement is bidirectional and not specified / plan:108-113**
- Task 1.5 says reducers "Errors logged via `fulcrum-core/logger`; never throw (prior art failure-isolation invariant)".
- This is silent-fail by design — exactly the failure mode adversarial F14 warns about. Task 1.7 adds a divergence monitor as the mitigation, but the SLO between "reducer failure" and "divergence-monitor catches it" is unspecified.
- Suggested fix: in Task 1.5 acceptance, require reducer errors to also (a) emit a `reducer_error` *event* on the same event bus (so a separate observer reducer can count + alert), and (b) mark the source SQLite row with a `kuzu_sync_failed_at` timestamp so the divergence monitor (Task 1.7) has a deterministic queue, not a 100-row sample.

**P1-5 / Security / Task 3.3 places policy check before query but the policy_rules table population is in the same task / plan:184-189**
- Task 3.3 acceptance: "role-policy lookup against `policy_rules` table. Default rule rows seeded by migration: `chief_of_staff` ALLOW; `software_engineer` / `test_engineer` / `reviewer` DENY."
- The migration that seeds `policy_rules` (`v2b_global_scope_policies.sql`) is a side-effect of the same task that adds the gate. If migration fails or is partial, the gate fall-through behavior is unspecified — does the recall return `[]`, or does it bypass to allow?
- Critical constraint #4 is "fail-closed". The acceptance does not specify the missing-rule fallback.
- Suggested fix: add an explicit fail-closed clause: "If no `policy_rules` row exists for `(role, scope='global')`, deny by default and emit a `policy_rule_missing` telemetry event." Add a unit test for the missing-row case.

**P1-6 / Feasibility / PR 18 (Copilot) wait condition slips through Phase 8 / plan:298-329**
- Phase 8 (PR 17, "Per-host enhancements") includes Task 8.3 "Build Claude Code `.claude-plugin/plugin.json` marketplace bundle" and Task 8.4 "OpenCode event subscriptions" — neither of which is Copilot, but neither is explicitly Copilot-clean either.
- Task 8.4 references `pre_compact_extract` for OpenCode `session.compacted`. This is fine. But Task 8.3 maps to §11.60 (Claude marketplace bundle), and §11.60 in `00-scope-split.md:110` is correctly listed under "deferred to v2b" — so v2a does not block PR 17. Good.
- However, no v2b PR explicitly stages "Copilot prep work" before PR 18 (Gate 5). Verified: `agent-integration/copilot/.agents/skills` symlink (Task 9.3) is gated by Gate 5; no earlier PR sneaks in Copilot prep. Confirmed clean.
- Why P1: this finding is the *adversarial check passing* — log it explicitly so the user knows the question was asked.
- Suggested fix: add a one-line "Verified: no Copilot prep work appears in PRs 10–17" note to the Open Questions section so future readers know the check was performed.

**P1-7 / Coherence / Task 4.3 software_engineer-only filter for `code_context` contradicts Part 02 surface / plan:217-221**
- Task 4.3: "MCP tool entries appear under `mcp__fulcrum__code_context` ... only when `--mode filtered` is in the right profile (`software_engineer` for `code_context`; both profiles for `project_context`)".
- Part 02 (`02-activation-and-inventory.md:88`) lists `code_context` as one of the 6 always-available CLI actions with no role gate: "`fulcrum action exec recall_memory / query_memory / search_code / code_context / project_context / write_memory`". Skill files (e.g., `chief_of_staff` orientation) explicitly call `code_context`.
- Restricting MCP exposure to `software_engineer` would mean a CoS agent operating in MCP-only mode (no CLI shell-out) cannot use `code_context`. CoS specifically needs cross-type code-graph traversal during orientation.
- Suggested fix: change Task 4.3 acceptance to expose `code_context` in BOTH `software_engineer` and `chief_of_staff` profiles, matching `project_context`'s mapping.

**P1-8 / Coherence / Task 6.2 maps to §11.33 but says "carry-forward" while §11.33 was a v2a AC / plan:272**
- §11.33 is explicitly listed as a v2a AC (`00-scope-split.md:106`). Task 6.2 acceptance: "scans rows where `normalize_version < CURRENT_VERSION`, re-runs sanitize + chunker, updates rows. Runs as background queue triggered on MCP server start."
- The note says "carry-forward, but the background rebuilder is v2b". This is fine *if* v2a ships only the column scaffolding without the background processor. But manifest B.10 (`docs/brainstorms/2026-04-16-memory-v2-copy-file-manifest.md:127`) implies the entire prior art `palace.py:50, 313-343` port (which IS the background processor) lands as part of "Already captured as v2 §3.2 column + §11.33 acceptance; port the actual comparison + queue logic." — without v2a/v2b distinction.
- Suggested fix: clarify in the cross-plan handoff section that v2a PR 1 ships ONLY the `normalize_version` column + read path, and the background re-processor migration is v2b PR 15 Task 6.2. Update the manifest line 127 to reflect the split.

### P2 — Nits

**P2-1 / Coherence / "5 prerequisite gates" claim vs document shape**
- The task description says "5 prerequisite gates" and the plan defines exactly 5 gates (plan:7-35). However, Task 9.x rows cite "Gate 1, Gate 5" (plan:339, 346, 353, 360) but never cite Gate 4 — yet Gate 4's eval baseline is the only thing that can validate Copilot's CLI-first output isn't degraded (per AC §11.66, plan:347). Probably overkill to cross-link, but worth a one-line "Gate 4 not gating PR 18" rationale.

**P2-2 / Coherence / Cross-plan handoff item #2 makes a falsifiable claim about file state / plan:503**
- "v2b extends from `packages/memory/src/kuzu/schema.ts` which today is at the v2a baseline (Memory + Entity only — File/CodeChunk/Symbol added in v2a PR 7)."
- "today" is ambiguous — at write-time of the v2b plan, v2a has not shipped, so the file is genuinely Memory + Entity only (matches handover §"Outstanding architectural decisions" #6 reference). After v2a PR 7 ships, it becomes the v2a baseline. The sentence reads as if both states are simultaneously true.
- Suggested fix: rephrase to "v2b assumes v2a PR 7 has shipped (current schema.ts has Memory + Entity only; v2a PR 7 adds File/CodeChunk/Symbol)."

**P2-3 / Coherence / Task 1.1 AC mapping to §11.59 is a stretch / plan:81**
- §11.59 (`07-acceptance-and-planning.md:79`): "Orthogonal tables deliberately absent. Grep of Kuzu graph reducers against `advisory_locks` / `display_id_sequences` / `agent_state_projection` / `schema` / `embedding_registry` returns no hits."
- This is a *reducer* check, not a DDL check. Task 1.1 authors DDL only; reducers come in Task 1.5. Mapping §11.59 to Task 1.1 conflates the two.
- Suggested fix: move the §11.59 mapping from Task 1.1 to Task 1.5 (or Task 1.7 divergence monitor).

**P2-4 / Coherence / Task 1.6 batch-size + flush-interval are stated without source / plan:115-121**
- "64 events per Kuzu transaction OR flushes every 250ms"; "buffer up to 1024 events; beyond that, drop oldest with `reducer_overflow` error".
- These are reasonable defaults but no source citation. Risk: arbitrary numbers become load-bearing for AC tests.
- Suggested fix: tag them as "tunable defaults; calibrated by PR 14 fulcrum-eval baseline" and move them to a config constant that can be adjusted without code edits.

**P2-5 / Product / "monitor Graph tab" delivery is partial / plan:389-394**
- Task 10.4 acceptance: "renders force-directed view of current project's Kuzu graph filtered to node kinds + scope". The "claimed value" in `00-scope-split.md:184` is broader: "Dashboard Graph tab" with implication of operator-inspection of the full graph.
- Task 10.4 only hits `/graph/neighborhood/<node-id>?depth=2` — there's no "show me the full project graph" path; the user has to seed a node-id. Fine for v1, but doesn't fully deliver the product framing.
- Suggested fix: either narrow the v2b promise (update scope-split:184 to "neighborhood-explorer Graph tab") or add Task 10.4b to render a workspace-overview entry view.

**P2-6 / Coherence / "5 prerequisite gates" wording tension**
- Plan overview line 5 says "v2b is gated behind five prerequisites that must clear before any PR begins". But Gate 2 only blocks PR 10 (plan:16), Gate 3 only blocks PR 11 (plan:22), Gate 4 only blocks PR 14 (plan:27), Gate 5 only blocks PR 18 (plan:32). Only Gate 1 truly blocks "any PR".
- Suggested fix: reword to "v2b is gated behind one universal prerequisite (Gate 1) plus four PR-specific gates (Gates 2–5)".

## Gate analysis

**Gate 1 (v2a bake ≥2 weeks)** — *PASS criteria are clear and actionable.* "Shipped, deployed across at least 1 internal workspace, ≥2 wall-clock weeks without rollback" is testable. Cited correctly to scope-split:200. Slip risk: every PR (10–21) is gated, so a single rollback resets all v2b work. **No tasks slip past it** — every task in plan:74–466 carries "Prerequisite gate: Gate 1".

**Gate 2 (Identity decision)** — *PASS criteria minimal but actionable* (written user decision in `docs/decisions/`). **FAIL on actionability of the FAIL branch:** see P0-2. The "re-shuffle" is undefined. Tasks 1.1–1.8 (PR 10) correctly cite Gate 2 (plan:80, :89, :96, :104, :111, :119, :127, :135). No task slips. But because the FAIL branch has no concrete plan, the gate is half-actionable.

**Gate 3 (249-session sweep)** — *PASS criteria are vague* (see P0-3 — invented 5%, no escalation owner). Cited correctly to handover adversarial F3. Tasks 2.1, 2.2, 2.3 cite Gate 3 (plan:146, :154, :161). Task 3.1 (plan:173) cites Gate 3 transitively via "PR 11 Task 2.1" — correct. **No task slips** but Gate 3 itself needs hardening.

**Gate 4 (Fulcrum-specific eval)** — *PASS criteria clear* ("baseline corpus checked in to `packages/memory/src/eval/fulcrum-recall/` BEFORE LongMemEval harness lands"). Tasks 5.1, 5.2, 5.3, 5.4 cite Gate 4 (plan:231, :239, :247, :254). **No task slips.** Strongest of the five gates.

**Gate 5 (Copilot user request)** — *PASS criteria leave format unresolved* (plan acknowledges in Open Question #3, plan:528). Tasks 9.1–9.4 cite Gate 5 (plan:339, :346, :353, :360). **No task slips** — verified no earlier PR (10–17) sneaks in Copilot prep work (P1-6).

## Auto-applied fixes

(Empty — review does not mutate the plan.)

## Lens summary

- **Coherence:** Two real contradictions (Dreaming v2a-vs-v2b inheritance P0-1; double-booked ACs §11.64/67/69 P1-1) plus an off-by-one (P1-2). Other lens checks pass.
- **Feasibility:** PR 10's 2-week estimate honors adversarial F1; reducer batching/backpressure spec is concrete (Task 1.6); 249-session sweep design is implementable. Kuzu DDL composition with v2a seed assumed-additive without verification (P1-3).
- **Scope guardian:** No creep beyond v2b. ACs §11.64/67/69 are double-booked across the v2a/v2b boundary (P1-1, source-doc problem the plan inherits).
- **Security:** Loopback binding (Task 10.1), Cypher allowlist (Task 10.1), policy gate (Task 3.3) all present. Operator-only rollback preserved (Task 6.3 not exposed via `fulcrum action exec`). One missing-rule fallback gap (P1-5).
- **Adversarial:** Gate 2 AGENTS.md-wins re-shuffle is hand-wave (P0-2). Gate 3 5% threshold invented (P0-3). PR 18 Copilot prep verified clean (P1-6 confirms negative). Reducer fail-silent surfaced as P1-4.
- **Product:** v2b delivers full graph (PR 10), `code_context`/`project_context` (PR 13), monitor Graph tab (PR 19) — but Graph tab is neighborhood-only, not workspace-overview (P2-5). Bake-after-v2a window is 2 weeks (Gate 1) — defensible but not stress-tested for "did we learn anything" criteria.
