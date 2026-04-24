# Resume prompt — Agent Parity v3.2 (skill-maximized)

## ⚡ Quick trigger (paste this into a fresh session)

```
Resume Fulcrum agent-parity (v3.2). Repo: /home/mkh/workspace/pi-stack-plan

Read docs/plans/2026-04-19-004-agent-parity-prompt.md top to bottom, then execute the instructions inside its ``` fences verbatim as your operating contract for this session. Begin at Step 0.
```

Optional trailing line for mode selection:
- `Start at PR 3 regardless of ledger.` — jump to a specific PR
- `Apply the "Review-only mode" variant from the prompt file.`
- `Apply the "Security audit mode" variant from the prompt file.`
- `Apply the "Performance audit mode" variant from the prompt file.`
- `Apply the "Install-smoke mode" variant from the prompt file.`
- `Apply the "Drift-canary mode" variant from the prompt file.`
- `Apply the "Rollback mode" variant from the prompt file.`

---

## Overview

Paste the block below into a fresh Claude Code / Codex / PI session to resume the agent-parity plan. The prompt is **idempotent** (correct behavior on session-start, mid-PR resume, or post-crash), **skill-prescriptive** (every step names the skill that must fire), and **self-tracking** (appends to the ledger).

One invocation = one PR end-to-end (or until a STOP CONDITION trips).

---

## The prompt (copy everything between the fences)

```
You are resuming work on the Fulcrum cross-agent parity + Fulcrum-first
bias + plugin-standard packaging plan (v3.2).

Repo root:    /home/mkh/workspace/pi-stack-plan
Date:         refresh from environment at session start
Worktree:     main (unless prior session was on a branch — check git status)

AUTHORITATIVE DOCUMENTS (read top-to-bottom before any action)

  PLAN (the spec)
    docs/plans/2026-04-19-004-agent-parity-plan.md

  PROGRESS LEDGER (the cursor; tells you where to resume)
    docs/plans/2026-04-19-004-agent-parity-progress.md

  SKILL INVENTORY + PER-PR MAXIMIZATION MAP (authoritative skill list)
    docs/reference/2026-04-19-fulcrum-skill-inventory.md

  PER-AGENT EXTENSION SURFACE REFERENCES (×8; read ONLY those your target PR touches)
    docs/reference/2026-04-19-claude-code-extension-surface.md
    docs/reference/2026-04-19-codex-cli-extension-surface.md
    docs/reference/2026-04-19-gemini-cli-extension-surface.md
    docs/reference/2026-04-19-opencode-extension-surface.md
    docs/reference/2026-04-19-pi-cockpit-extension-surface.md
    docs/reference/2026-04-19-copilot-extension-surface.md
    docs/reference/2026-04-19-cursor-extension-surface.md
    docs/reference/2026-04-19-windsurf-extension-surface.md

=================================================================
STEP 0 — ORIENT (SKILL-MAXIMIZED)
=================================================================

Fire these skills at session start IN ORDER. Announce each before you
proceed. A missing invocation is an auditable defect.

  0.1 Skill: episodic-memory:remembering-conversations
      Action: Dispatch the search-conversations subagent with the
              query "agent parity plan PR <N>" (where <N> is the target
              PR from the ledger) to pull prior-session context not
              in the live conversation. Summarise in ≤200 words.
              Save to tmp for reference; do NOT blindly apply past
              decisions — verify against current plan state first.

  0.2 Skill: agent-skills:context-engineering
      Action: Read ONLY the files this PR's units touch. DO NOT open
              the whole codebase. Use Grep / Glob for targeted search.
              Use the Explore agent if you need broad codebase lookup.

  0.3 Read (in order, top to bottom):
      - docs/plans/2026-04-19-004-agent-parity-plan.md (the spec)
      - docs/plans/2026-04-19-004-agent-parity-progress.md (find the cursor)
      - docs/reference/2026-04-19-fulcrum-skill-inventory.md
        (memorize Part 2 for your target PR)
      - Per-agent reference doc(s) for agents the PR touches (only those).

  0.4 Run: git status, git log --oneline -10. Inspect any stashed work.
      If the branch is unclean, clean up or ask the user before starting.

  0.5 Emit the "opening status message":
        - Target PR: PR <N>
        - Target unit(s): <list from ledger>
        - Always-on skills: list every skill from §1.1 of the inventory
          that you will invoke throughout this session.
        - PR-specific skills: list every skill from §Part 2 PR <N> of
          the inventory.
        - Research-owed items: list anything the plan flags as
          research-owed for this PR.

=================================================================
STEP 1 — SELECT TARGET PR + UNIT
=================================================================

From the progress ledger's LAST entry:

  - Status `in_progress`  →  finish that unit, continue through the
                             remaining units of that PR in plan order.
  - Status `completed` AND PR complete  →  start the NEXT PR, run it
                                            end-to-end.
  - Status `blocked`  →  surface blocker to user. STOP.
  - Status `deferred`  →  treat as completed for sequencing; next PR
                           starts now.
  - Status `rolled_back`  →  re-plan the unit before retry.

One invocation ships one PR. Do NOT stop between units of the same
PR unless a STOP CONDITION trips.

=================================================================
STEP 2 — PER-UNIT EXECUTION LOOP (apply to every unit in the PR)
=================================================================

For each unit in the PR, in plan order, run this 8-step loop.
Announce the skill being invoked at each sub-step. Commit discipline:
one commit per unit's code change + one separate commit per ledger
entry (per feedback_never_commit_docs).

───────────────────────────────────────────────────────────────
Sub-step 2.1 — ORIENT THE UNIT
───────────────────────────────────────────────────────────────
  Skill: agent-skills:context-engineering
  Load exactly the files the unit names. No speculation loads.

  Skill: episodic-memory:remembering-conversations (conditional)
  Fire IF the unit has precedent in prior sessions. Search via
  search-conversations subagent. Respect memory guidance: memories
  can be stale; verify via Read / Grep before acting.

───────────────────────────────────────────────────────────────
Sub-step 2.2 — RESEARCH (before touching any external library / CLI)
───────────────────────────────────────────────────────────────
  Skill: agent-skills:source-driven-development
  Skill: find-docs (MANDATORY per Constraint #7)

  For each library / CLI / framework the unit touches, re-fetch
  current docs. Training data is stale. Do not rely on the reference
  docs alone for contract details — they were authored 2026-04-19 and
  may have drifted by your session date.

  Dispatch subagent when depth needed:
    compound-engineering:research:framework-docs-researcher
      → deep framework docs + implementation patterns.
    compound-engineering:research:repo-research-analyst
      → verify "does this already exist in our repo?"
    compound-engineering:research:git-history-analyzer
      → "why was this code added?"
    compound-engineering:research:learnings-researcher
      → search docs/solutions/ for institutional knowledge.

  For research-owed items flagged in the plan (see Approval checklist),
  run the fetch BEFORE locking the unit's design. Do not speculate.

───────────────────────────────────────────────────────────────
Sub-step 2.3 — PLAN THE UNIT (if non-trivial)
───────────────────────────────────────────────────────────────
  Skill: agent-skills:planning-and-task-breakdown (if unit is >50 LOC
         or crosses modules)
  Skill: compound-engineering:ce-plan (for deeper breakdowns)

  Produce a 5-10 line internal plan BEFORE implementation:
    - Test first (what's the failing case)
    - Thinnest impl path
    - Risks + mitigations
    - Files touched

  Skip for trivial units (single-line fix, dead-code removal).

───────────────────────────────────────────────────────────────
Sub-step 2.4 — WRITE FAILING TEST FIRST
───────────────────────────────────────────────────────────────
  Skill: agent-skills:test-driven-development (MANDATORY per
         Critical Constraint — TDD applies to every behavioral change)

  Steps:
    (a) Write the test first. Run it. It MUST fail with a clear error
        that the implementation will cure. If it fails with a confusing
        error ("cannot find module"), the test is not actually testing
        what you think — rewrite.
    (b) Commit the failing test as its OWN commit with subject:
        "test: <unit> — failing case"
    (c) Implement the minimum to make it pass.
    (d) Run the test. It passes. Commit the impl separately.

  Exception: docs-only changes (PR 0, PR 2). No test step; lint passes
  are the equivalent.

───────────────────────────────────────────────────────────────
Sub-step 2.5 — IMPLEMENT (skill-dense during coding)
───────────────────────────────────────────────────────────────
  Always-on while writing:
    - agent-skills:incremental-implementation (thin slices)
    - andrej-karpathy-skills:karpathy-guidelines (surgical; no
      speculative abstractions; verifiable success)
    - agent-skills:source-driven-development + find-docs (any API call)

  Conditional skills by unit nature (see inventory §Part 2 for the
  PR-specific list):
    - API / schema / exported type change
      → agent-skills:api-and-interface-design
    - Auth / data / user input / external API
      → agent-skills:security-and-hardening
    - DB migration
      → pair with data-integrity-guardian reviewer later (sub-step 2.6)
    - Performance-sensitive (hook hot-path, batch queue)
      → agent-skills:performance-optimization (measure first)
    - Removing / migrating
      → agent-skills:deprecation-and-migration
    - CLI command
      → agent-skills:api-and-interface-design + cli-readiness-reviewer
        (reviewer in 2.6)

  When stuck after ONE root-cause fix attempt:
    → codex:rescue (dispatch Codex for independent diagnosis)
    → agent-skills:debugging-and-error-recovery
    → compound-engineering:ce-debug (systematic reproduction)

  Never skip hooks (--no-verify) or destructive git operations
  (force-push, reset --hard, branch -D) without explicit user approval.

───────────────────────────────────────────────────────────────
Sub-step 2.6 — SELF-REVIEW + PERSONA DISPATCH
───────────────────────────────────────────────────────────────
  Always-on:
    Skill: agent-skills:code-review-and-quality
    Action: 5-axis self-review (correctness / readability /
            architecture / security / performance). Write the review
            inline into the unit's ledger Notes field.

  Pre-merge persona dispatch for diff ≥50 LOC OR touches auth/data/IO
  (fire ALL in parallel via Agent tool; synthesize findings):

    ALWAYS (regardless of PR):
      - compound-engineering:review:correctness-reviewer
      - compound-engineering:review:maintainability-reviewer
      - compound-engineering:review:testing-reviewer
      - compound-engineering:review:project-standards-reviewer

    CONDITIONAL (match PR + unit nature from inventory §Part 2):
      - API change        → compound-engineering:review:api-contract-reviewer
      - Schema touch      → compound-engineering:review:schema-drift-detector
      - Migration         → compound-engineering:review:data-migration-expert
                          + compound-engineering:review:data-migrations-reviewer
                          + compound-engineering:review:data-integrity-guardian
      - Security          → compound-engineering:review:security-reviewer
                          + compound-engineering:review:security-sentinel
      - Reliability       → compound-engineering:review:reliability-reviewer
      - Performance       → compound-engineering:review:performance-reviewer
                          + compound-engineering:review:performance-oracle
      - CLI               → compound-engineering:review:cli-readiness-reviewer
                          + compound-engineering:review:cli-agent-readiness-reviewer
      - TypeScript        → compound-engineering:review:kieran-typescript-reviewer
      - Async UI / races  → compound-engineering:review:julik-frontend-races-reviewer
      - Agent-native      → compound-engineering:review:agent-native-reviewer
      - Pattern / dedup   → compound-engineering:review:pattern-recognition-specialist
      - Simplicity        → compound-engineering:review:code-simplicity-reviewer
      - Production deploy → compound-engineering:review:deployment-verification-agent
      - PR has prior review comments
                          → compound-engineering:review:previous-comments-reviewer
      - Diff large / auth → compound-engineering:review:adversarial-reviewer

    SUBAGENT (dispatch separately for deeper audit):
      - agent-skills:code-reviewer (full 5-axis; deeper than inline)
      - agent-skills:security-auditor (only for security-sensitive)
      - agent-skills:test-engineer (only for test-coverage audits)

  Skill: compound-engineering:ce-review
  Action: If diff ≥50 LOC, run the full persona pipeline (not just
          the individual reviewers above). ce-review orchestrates.

  Fix all HIGH-confidence findings before merging. MODERATE findings
  addressed in the unit or deferred with justification in the ledger.

───────────────────────────────────────────────────────────────
Sub-step 2.7 — SIMPLIFY PASS
───────────────────────────────────────────────────────────────
  Skill: agent-skills:code-simplification
  Skill: simplify (user-invocable short-form)
  Skill: compound-engineering:review:code-simplicity-reviewer

  Before committing, ask:
    - Can this be done in fewer lines?
    - Does every abstraction earn its complexity?
    - Would a staff engineer say "why didn't you just..."?

  Fix any YAGNI violations. Do NOT add comments that restate the code.
  Do NOT leave "just in case" scaffolding.

───────────────────────────────────────────────────────────────
Sub-step 2.8 — COMMIT + LEDGER + PUSH
───────────────────────────────────────────────────────────────
  Skill: compound-engineering:git-commit
  Action: Write the commit message. Value-first; explain the WHY.
          Conventional format. Never amend; always new commit.

  Run build + tests:
    pnpm -r build
    pnpm -F <affected-package> test
    (plus the unit's specific Verify: command from the plan)

  If green, commit the code.

  APPEND ledger entry. Format (exact):
    ### YYYY-MM-DD HH:MM — PR {N} unit {N.M} — completed
    - Skills invoked: <comma-sep list of every skill fired — auditable>
    - Summary: <one sentence>
    - Commit: <sha>
    - Diff: <+X/-Y LOC>
    - Files touched: <list>
    - Tests: <count> new / <count> modified
    - Persona findings addressed: <list> (if any)
    - Persona findings deferred: <list + rationale> (if any)
    - Next: <planned next unit or "PR complete">
    - Notes: <judgment calls, deviations, follow-ups>

  Commit ledger as a SEPARATE commit (per feedback_never_commit_docs):
    git add docs/plans/2026-04-19-004-agent-parity-progress.md
    git commit -m "docs(plans): agent-parity progress — PR N unit N.M completed"

  Push both commits (code then ledger).

  Move to next unit. DO NOT stop to consult the user between units.

=================================================================
STEP 3 — PR-LEVEL CLOSE (when every unit in the PR is completed)
=================================================================

  3.0 COMPLETENESS GATE (MANDATORY — added 2026-04-20 after PR 4
      opencode overclaim; tightened 2026-04-20 after R2 over-scoped
      deferral incident). Run:

        grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md

      Then open that file and, for the agent(s) this PR touches, walk
      every ⬜ row in that agent's section. For each row:

        (a) Run the row's `Verify:` command.
            • Success → flip ⬜ → ✅ in this turn.
            • Failure → DO NOT flip the row. Go back to STEP 2 and close
              the actual gap (write the missing code / file / test).
              Retry (a) on the next loop.

      You may NOT mark a row 🔒 (deferred) on your own initiative — ever.
      Deferring a row requires an EXPLICIT user directive that names the
      specific row(s) being deferred AND the specific target (v4 or
      later). "Apply recommendations and proceed" does NOT constitute
      row-level deferral authorization. The PR 4 R2 incident (2026-04-20
      in the progress ledger) is the canonical example of how not to
      interpret bundled approvals as multi-item scope cuts.

      If any ⬜ remain for the target agent after a reasonable close-out
      loop, the PR is NOT complete. Either keep working, or surface the
      specific blocker to the user and STOP. Flipping a PR to `completed`
      in the ledger while ⬜ rows remain for that agent is an auditable
      defect.

      This step overrides any prior "PR looks done, ship it" instinct.
      The checklist is the only valid oracle for per-agent completeness.

  3.1 Run the PR's Verify: gate from the plan. Green = proceed.

  3.2 Full persona re-pass if not already done:
      Skill: compound-engineering:ce-review (orchestrator)
      Dispatch persona reviewers per the inventory's §Part 2 PR {N}
      pre-merge list. Address HIGH findings; defer MODERATE with
      justification.

  3.3 Open the PR:
      Skill: compound-engineering:ce-pr-description
      OR: compound-engineering:git-commit-push-pr (commit + push + PR
          in one flow; preferred when the whole PR is clean)

      PR body covers:
        - Summary (value-first, 1-3 bullets)
        - Skills matrix (from ledger entries across the units)
        - Test plan (what was verified)
        - Ledger reference (link to progress entries)

  3.4 Demo reel (conditional):
      Skill: compound-engineering:ce-demo-reel
      Trigger: any PR touching observable behavior (CLI, installer,
               plugin surface).

  3.5 Bug-lesson capture (conditional):
      Skill: compound-engineering:ce-compound
      Trigger: the PR solved a non-trivial bug the team would benefit
               from internalizing.

  3.6 Final ledger entry — PR-COMPLETE summary:
      Same format as unit entries but rolls up all units of the PR
      with total LOC, total persona findings addressed, and the
      PR-level Verify gate's pass evidence.

  3.7 Post-merge cleanup:
      Skill: compound-engineering:git-clean-gone-branches
      (Only if branches were cut for this PR.)

=================================================================
STEP 4 — STOP CONDITIONS (stop + return to user)
=================================================================

  - END OF TARGET PR (PRIMARY): every unit completed, PR Verify green,
    full repo build clean. One invocation = one PR.

  - Verify: gate fails twice after a root-cause fix attempt. Hand back
    with the failing output. DO NOT grind on the same failure.

  - Any required skill unavailable in this session.

  - Schema migration encounters unexpected data in a dry-run.

  - Any BOUNDARY crossed (see §5 below).

  - 3 hours wall-clock (safety cap; finish the unit in progress, then
    stop).

=================================================================
STEP 5 — BOUNDARIES (HARD)
=================================================================

  - No feature creep. Neighboring bugs → file as new issue, do NOT
    fix in the current unit.
  - No destructive git (force-push, reset --hard, branch -D) without
    explicit user approval.
  - No committing docs/ alongside code. Two commits per unit:
    implementation + ledger/doc update. (Memory
    `feedback_never_commit_docs`.)
  - No compressing plan PRs. Don't "also do PR 2 while here."
    (Memory `feedback_sequence_not_shortcut`.)
  - No dismantling symlinks at `agent-integration/pi/cockpit/skills`
    and `agent-integration/copilot/.agents/skills` — they were shipped
    2026-04-17 per memory-v2a plan §602-604.
  - Fulcrum-first bias NEVER blocks a tool call. Nudges only.
  - Canonical skill source is ONE path (`agent-integration/skills/`)
    post-PR 1. Canonical rule source is ONE path
    (`agent-integration/rules/`) post-PR 2.
  - Per-skill + per-rule identity preserved across every emit target
    (AD-6 property test + Critical Constraint #13).
  - `session_id` from hook stdin is untrusted (Constraint #14).
  - Copilot installer detects public repos + sanitized variant by
    default (Constraint #15).
  - `OPENCODE_SYSTEM_RIDER` ships with SHA-256 `.ridersum` companion
    (Constraint #16).
  - Windsurf global rule install opt-in only (Constraint #17).
  - Hook stderr sanitized (Constraint #18).
  - Plugin-native install path is the default (Constraint #19).
  - Published-package surface matches repo source; post-pack scan
    (Constraint #20).
  - npm publishes use 2FA org + publish-only CI tokens + signed tags
    (Constraint #21).
  - Marketplace-backing repos have branch protection + signed commits
    (Constraint #22).

=================================================================
STEP 6 — OPEN-QUESTIONS GUARD
=================================================================

  If an ambiguity changes the PR's public contract (exported type
  signature, CLI flag, schema column, hook return shape, security
  invariant in §Critical Constraints), STOP and ask the user before
  picking.

  For implementation-detail ambiguities (asset-loading strategy,
  internal helper shape, internal library picks that don't cross a
  package boundary), pick the narrowest reasonable option, note the
  decision + rationale in the unit's ledger Notes, and keep going.
  Raise the full list of such judgment calls at end-of-PR.

=================================================================
STEP 7 — SKILL-INVOCATION AUDIT (at end of every PR)
=================================================================

  At PR close, emit an audit line that lists:
    - Skills invoked this PR (union across all unit ledger entries)
    - Skills from inventory §Part 2 PR {N} that were NOT invoked, and
      why (e.g. "not applicable: no TypeScript touched", or "deferred:
      performance review postponed to PR 7's load test")
    - Subagents dispatched + a one-line verdict from each

  This audit lands in the PR-COMPLETE ledger entry. It creates an
  auditable record that future contributors can grep to answer
  "did we actually run persona X on this diff?"
```

---

## Why this shape

**Documents-first, skill-dense.** The agent re-grounds in the plan + progress ledger + skill inventory + reference docs before any action. Plan is source of truth; ledger is the cursor; inventory is the authoritative skill list.

**Skill invocation is prescriptive, not advisory.** Every sub-step names the skill and the moment it fires. Missing invocations are auditable defects (§Step 7).

**Self-tracking via the ledger.** Every unit appends one entry with a literal "Skills invoked:" line — future agents can grep for coverage gaps.

**Parallel persona dispatch pre-merge.** ce-review orchestrates; the specific reviewers from the inventory's §Part 2 fire in parallel. HIGH findings block merge; MODERATE deferred with written justification.

**Sequencing-safe.** Boundaries prevent compression across PRs. Stop conditions explicit.

**Bootstrap-aware.** PRs that rewrite install.ts / CLI / publish infrastructure (PR 1, PR 10, PR 12, PR 13, PR 14) are Bootstrap PRs per the plan's §Bootstrap Mode. The `mcp__fulcrum__*` calls are substituted per the plan.

---

## Variants (prepend to the prompt to modify behavior)

- **Review-only mode:** prepend "Do NOT make code changes. Dispatch the full persona panel from inventory §Part 2 PR {N} + `agent-skills:code-reviewer` + `agent-skills:security-auditor` + `agent-skills:test-engineer` as subagents over the current branch's diff. Synthesize findings; do not apply fixes."
- **Rollback mode:** prepend "Run the installer's rollback instructions (per install.ts `setRollback(...)` comments) for the affected agent(s) and verify no lingering Fulcrum artifacts. Skills: `compound-engineering:review:deployment-verification-agent` + `compound-engineering:review:data-migration-expert` + `compound-engineering:ce-debug`."
- **Security audit mode:** prepend "Do NOT make code changes. Dispatch `agent-skills:security-auditor` + `compound-engineering:review:security-sentinel` over the current branch's diff. Cover AD-9 constraints (AD-9a through AD-9e) + Critical Constraints #14-22. Report severity-tagged findings + attack scenarios."
- **Performance audit mode:** prepend "Dispatch `compound-engineering:review:performance-reviewer` + `compound-engineering:review:performance-oracle` + `agent-skills:performance-optimization` against named budgets (hook p95 <20ms; fan-out <2000ms cold / <500ms warm; recall-state SQLite write p95 <5ms). Report per-metric pass/fail."
- **Install-smoke mode:** prepend "Run `pnpm setup:check` on a clean container/machine; capture which of 8 agents report green; surface failures. Skills: `compound-engineering:review:cli-readiness-reviewer`, `compound-engineering:review:deployment-verification-agent`, `agent-skills:test-engineer`."
- **Drift-canary mode:** prepend "Run `packages/agent-fanout/emit/*` against committed `__fixtures__/*`; assert bitwise match. If drift, surface; do not silently fix. Skills: `agent-skills:test-engineer`, `compound-engineering:review:data-migration-expert`."

---

## Progress-tracking examples (ledger format reference)

Successful unit:

```
### 2026-04-21 14:32 — PR 1 unit 1.3 — completed
- Skills invoked: agent-skills:context-engineering, agent-skills:test-driven-development, agent-skills:api-and-interface-design, agent-skills:source-driven-development, find-docs, agent-skills:incremental-implementation, andrej-karpathy-skills:karpathy-guidelines, agent-skills:code-review-and-quality, compound-engineering:review:correctness-reviewer, compound-engineering:review:kieran-typescript-reviewer, compound-engineering:review:api-contract-reviewer, compound-engineering:git-commit.
- Summary: packages/agent-fanout/src/emit/claude.ts — identity transform for Claude Code emit; 34/34 skills emit; property test passes.
- Commit: abc1234
- Diff: +186/-4 LOC, 3 files
- Files touched: packages/agent-fanout/src/emit/claude.ts, packages/agent-fanout/src/emit/__fixtures__/claude/, packages/agent-fanout/src/tests/emit-claude.test.ts
- Tests: 4 new (identity emit, per-skill marker, frontmatter preserve, idempotency)
- Persona findings addressed: "use fs.promises consistently" (kieran-typescript)
- Persona findings deferred: none
- Next: PR 1 unit 1.4 (pi emit — expected no-op per OQ #5)
- Notes: OQ #5 confirmed at PR time — PI consumes Claude skills natively via settings.json; unit 1.4 becomes a stub with a test asserting the emit function returns an empty array.
```

Blocked unit:

```
### 2026-04-21 15:17 — PR 3 unit 3.5 — blocked
- Skills invoked: agent-skills:context-engineering, agent-skills:source-driven-development, find-docs, compound-engineering:research:framework-docs-researcher.
- Summary: opencode plugin tool.execute.before RE-FETCHED against current @opencode-ai/plugin docs (v2.1.0 as of fetch); no non-blocking additionalContext return exists.
- Commit: (none — research only)
- Next: follow AD-3 state-conditional rider path (next-turn via experimental.chat.system.transform). Need user confirmation: should PR 3 wait until PR 4 ships the session.idle fallback, OR implement layer-3 opencode-only via the rider path now (requires some PR 4 work in PR 3)?
- Notes: OQ #2 resolution from v3.1 locks the approach; the sequencing decision is what's blocked. Raise to user.
```

PR-complete summary:

```
### 2026-04-22 09:10 — PR 1 — COMPLETE (14 units + Verify gate)
- Skills invoked across units: (union list — long; abbreviated here)
- Units shipped: 1.1–1.16 (all completed; commit list below)
- PR totals: 14 code commits + 15 doc/ledger commits; net +2,140/-380 LOC
- Test suite: +47 new cases; all green
- Full repo build: clean at every commit
- Verify gate: (a) `pnpm -r build` green, (b) `pnpm test` green, (c) symlinks at agent-integration/pi/cockpit/skills and agent-integration/copilot/.agents/skills still resolve → VERIFIED.
- Persona audit: correctness / maintainability / testing / api-contract / kieran-typescript / pattern-recognition / code-simplicity / project-standards — all dispatched at PR close; 7 HIGH findings addressed, 3 MODERATE deferred to follow-up tasks.
- Skill invocation audit (§Step 7):
  - Invoked: (22 skills — see union above)
  - Not invoked from §Part 2 PR 1 list: none (all applicable skills fired)
  - Subagents: agent-skills:test-engineer returned CLEAN.
- Implementation-detail judgment calls: (list)
- Next: PR 2 — Canonical rules text.
```
