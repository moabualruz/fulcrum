# Reusable Prompt — Continue Memory v3 Work

Paste the block below into a fresh Claude Code / Codex / PI session when you want to resume work on the memory v3 tiered architecture. The prompt is idempotent: running it at session-start, after a break, or after a crash all produce the correct "figure out where we are, do the next unit, commit" behavior.

---

## The prompt (copy everything between the fences)

```
You are resuming work on the Fulcrum memory v3 tiered architecture.
Repo root: /home/mkh/workspace/pi-stack-plan

AUTHORITATIVE DOCUMENTS (read both before doing anything else)
  1. docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md
     — the spec + 10-PR phased rollout + skill matrix + test corpus
  2. docs/plans/2026-04-18-002-memory-tiered-architecture-progress.md
     — append-only progress ledger; last-completed unit is the resume point

ORIENT (always, before any other action)
  - Skill: episodic-memory:remembering-conversations — search prior sessions
    on this plan so you inherit context that's no longer in the live
    conversation.
  - Skill: agent-skills:context-engineering — load only what the NEXT unit
    requires; do NOT read the whole codebase.
  - Read both authoritative documents top-to-bottom. Skim is not enough on
    the first session of a day; re-read fully if >6h have passed since the
    last entry in the progress ledger.
  - Run: git status, git log --oneline -10, and inspect any stashed work.

SELECT TARGET PR (this session ships a whole PR, not a single unit)
  - Open the progress ledger. Find the last entry.
      - If the last entry's status is `in_progress`, resume its PR —
        finish the open unit, then keep going through the remaining
        units of that PR in plan order.
      - If the last entry marks the end of a PR (`completed` and all
        units of that PR are done), start the NEXT PR and run it end
        to end.
      - If the last entry is `blocked`, surface the blocker to the
        user and stop. Do not work around it.
  - Units inside the PR stay atomic: one commit per unit, one ledger
    entry per unit, push after each unit. But do NOT return to the
    user between units — keep executing until the PR's final unit
    lands or a STOP CONDITION trips.
  - A PR is "complete" only when every unit listed in the plan's PR
    section has an entry in the ledger with status `completed` and
    the PR's Verify gate has passed.

INVOKE REQUIRED SKILLS (per the plan's §Skill Utilization Matrix + MASTER-PLAN.md §Skill Arsenal)

  Always-on (every unit, every time — list these in your opening status msg):
    - agent-skills:context-engineering
    - agent-skills:incremental-implementation
    - agent-skills:test-driven-development
    - agent-skills:code-review-and-quality
    - agent-skills:source-driven-development + find-docs (for every
      library API touched — even "well known" ones)
    - andrej-karpathy-skills:karpathy-guidelines
    - episodic-memory:remembering-conversations (at session start only)
    - compound-engineering:git-commit (at commit time)
    - compound-engineering:ce-pr-description (when opening PRs)

  Per-PR load-bearing (MUST invoke before any code or prompt is written):

    PR 0 — Spec + schema scaffolding
      - agent-skills:spec-driven-development (plan IS the spec)
      - compound-engineering:document-review (adversarial + coherence
        + feasibility + scope-guardian)
      - compound-engineering:review:data-integrity-guardian pre-merge
      - compound-engineering:review:schema-drift-detector pre-merge
      - agent-skills:documentation-and-adrs for each Architecture Decision

    PR 1 — L0 raw-ingest + vault path split
      - agent-skills:api-and-interface-design (1.1 signature is a public
        contract all downstream depends on)
      - agent-skills:security-and-hardening (L0 file 0600 perm)
      - find-docs on node fs + chokidar
      - compound-engineering:review:reliability-reviewer pre-merge (watcher)

    PR 2 — L1 templates + page primitives + validator
      - agent-skills:api-and-interface-design (validator error codes
        are a public surface)
      - agent-skills:test-engineer (subagent — exhaustive rule-violation
        corpus)
      - find-docs on gray-matter / YAML 1.2

    PR 3 — Curator pipeline (BOOTSTRAP MODE)
      - codex:gpt-5-4-prompting — LOAD-BEARING. Invoke BEFORE writing
        ANY prompt string. This skill composes the curator prompt;
        without it you are guessing at structured-output delimiters.
      - codex:codex-cli-runtime (subprocess contract)
      - codex:codex-result-handling (JSONL event stream parse)
      - agent-skills:security-and-hardening (L0 body untrusted;
        isolate via <USER_CONTENT> delimiter per gpt-5-4-prompting)
      - compound-engineering:agent-native-architecture (backend
        selection is agent-facing)
      - compound-engineering:review:adversarial-reviewer pre-merge
      - agent-skills:security-auditor (subagent) pre-merge

    PR 4 — L2 reshape
      - agent-skills:performance-optimization (batch queue + p95 budget)
      - find-docs on @xenova/transformers batch-embed API
      - compound-engineering:review:performance-reviewer pre-merge

    PR 5 — Retrieval cutover
      - agent-skills:performance-optimization (graph 100ms budget)
      - compound-engineering:ce-optimize (tune RRF weights empirically;
        do NOT hand-pick)
      - agent-skills:shipping-and-launch (cutover = production flag flip)
      - compound-engineering:review:deployment-verification-agent
        (Go/No-Go checklist + SQL verify + rollback plan)
      - Full compound-engineering:ce-review persona panel pre-merge

    PR 6 — Data migration (BOOTSTRAP MODE)
      - agent-skills:deprecation-and-migration (load-bearing)
      - compound-engineering:review:data-migration-expert
      - compound-engineering:review:data-integrity-guardian
      - compound-engineering:ce-debug (first-run surprises guaranteed)
      - agent-skills:security-auditor (subagent — rollback audit chain)
      - compound-engineering:review:adversarial-reviewer pre-merge

    PR 7 — Lifecycle
      - agent-skills:performance-optimization (10k-page decay in <10s)
      - agent-skills:api-and-interface-design (lint output schema)
      - compound-engineering:ce-optimize (tune λ + retention-tier
        thresholds against eval corpus)

    PR 8 — Observability + docs
      - agent-skills:ci-cd-and-automation (eval gate in CI)
      - agent-skills:shipping-and-launch (pre-launch checklist)
      - compound-engineering:ce-demo-reel (capture ingest → curate →
        recall → mark-wrong → re-curate as a GIF for the PR body)
      - compound-engineering:onboarding (refresh ONBOARDING.md memory
        section)

    PR 9 — Cleanup
      - agent-skills:code-simplification (this is the whole point)
      - compound-engineering:review:data-migration-expert (canonical_text
        drop)
      - compound-engineering:review:schema-drift-detector
      - compound-engineering:git-clean-gone-branches (post-merge)

  Skill-by-scenario dispatch — invoke when the listed condition appears:

    Scenario: you are about to use an external library API
      → ALWAYS: agent-skills:source-driven-development + find-docs
      Rationale: training data is stale; verify the current signature.

    Scenario: you are stuck after one root-cause fix attempt failed
      → codex:rescue (independent diagnosis from a separate session)

    Scenario: a pattern you want already exists elsewhere in the repo
      → compound-engineering:research:repo-research-analyst (before
        implementing a new version)

    Scenario: you need to know why a piece of code was added
      → compound-engineering:research:git-history-analyzer

    Scenario: the diff is ≥50 LOC or touches auth/data mutations
      → compound-engineering:review:adversarial-reviewer pre-merge

    Scenario: the unit touches packages/core/src/db/schema.ts or any
      extension-package schema.ts
      → compound-engineering:review:schema-drift-detector +
        compound-engineering:review:data-integrity-guardian

    Scenario: the unit touches CLI command definitions or handlers
      → compound-engineering:review:cli-readiness-reviewer

    Scenario: the unit changes API routes / request-response / exported
      type signatures
      → compound-engineering:review:api-contract-reviewer

    Scenario: you are about to write a commit message
      → compound-engineering:git-commit

    Scenario: you are about to open a PR
      → compound-engineering:ce-pr-description

    Scenario: you just solved a non-trivial bug
      → compound-engineering:ce-compound (capture the lesson)

  List every invoked skill in the opening status message of each unit,
  so the human can audit which skills were actually applied.

EXECUTE EVERY UNIT IN THE TARGET PR
  - Bootstrap Mode (PRs 0, 3, 6) suppresses mcp__fulcrum__* calls per
    the plan. Use its substitutes.
  - For each unit, in plan order:
      1. Write the failing test first. Land the thinnest impl that
         passes.
      2. Run the unit's Verify command + relevant package's test suite.
      3. Run `pnpm -r build`.
      4. Commit the code. Push.
      5. Append a ledger entry for this unit. Commit the ledger.
         Push.
      6. Move to the next unit WITHOUT stopping to consult the user.
  - The ~500-LOC-per-PR budget in the plan is a soft goal, not a gate.
    PR 0 came in at 513 lines and PR 1 at 933; do not split a unit
    purely to chase the budget.
  - Do NOT touch files outside a unit's stated scope. No orthogonal
    cleanup, no "while I'm here" refactors.
  - If a unit surfaces a judgment call that is NOT covered by the
    plan's §Open Questions and NOT answered by a recent ledger entry,
    resolve it yourself with the narrowest reasonable choice, note
    the choice + rationale in that unit's ledger entry under `Notes:`,
    and continue. Raise it to the user at end-of-PR, not mid-PR.
    (See OPEN-QUESTIONS GUARD below for when to stop instead.)

VERIFY
  - Run the Verify: command named in the plan for this unit.
  - Run pnpm -r build and the relevant package's test suite.
  - For any unit that adds a behavioural change, confirm a committed
    regression test exercises it.

COMMIT + PUSH
  - Skill: compound-engineering:git-commit — write the message.
  - Never amend; always create new commits. Never skip hooks.
  - Push unless the user has said otherwise.

UPDATE PROGRESS LEDGER
  - Append one entry to docs/plans/2026-04-18-002-memory-tiered-architecture-progress.md
    using the format documented at the top of that file.
  - Commit the ledger update as a separate commit with message:
    `docs(plans): memory v3 progress — PR {N} unit {N.M} {status}`

STOP CONDITIONS (stop and return to user)
  - End of the target PR — every unit has a `completed` ledger entry,
    the PR's Verify gate is green, and the full repo build is clean.
    This is the PRIMARY stop; one invocation = one PR.
  - Any Verify: gate fails twice after a root-cause fix attempt.
    (Do NOT keep grinding on the same failure across more attempts —
    hand back with the failing output.)
  - Any required skill is unavailable in the current session.
  - Schema migration encounters unexpected data in a dry-run.
  - A BOUNDARY would be crossed to continue (see below).
  - 3 hours of wall-clock elapsed in the session (safety cap, not a
    goal — finish the unit in progress, then stop).

BOUNDARIES (hard)
  - No feature creep. If a neighbouring bug is discovered, file it as a
    new issue; do NOT fix it in the current unit.
  - No destructive git operations (force-push, reset --hard, branch -D)
    without explicit user approval.
  - No removing the FULCRUM_MEMORY_V3 flag until PR 9 cleanup unit 9.5.
  - No merging PRs without the required reviewer subagents per
    §Subagent Delegation having signed off.

OPEN-QUESTIONS GUARD
  - If an ambiguity changes the PR's public contract (exported type
    signature, CLI flag surface, schema column, or a security
    invariant from §Critical Constraints), STOP and ask before
    picking.
  - For implementation-detail ambiguities (asset-loading strategy,
    internal helper shape, internal library picks that don't cross
    a package boundary, etc.), pick the narrowest reasonable option,
    note the decision + rationale in the unit's ledger `Notes:`,
    and keep going. Raise the full list of such judgment calls at
    end-of-PR so the user can reverse any of them before the next PR.
```

---

## Why this shape

- **Documents-first** — the agent re-grounds in the plan + progress ledger before touching anything. The plan is the source of truth; the ledger is the cursor.
- **Skill matrix explicit** — references `§Skill Utilization Matrix` by name so the agent looks up the required skills instead of guessing.
- **Stop conditions** — explicit; prevents marathon sessions that drift.
- **Bootstrap mode aware** — PRs 0, 3, 6 have different workflow per the plan; the prompt tells the agent to respect that.
- **Self-updating ledger** — every run appends, so the next run can find the cursor without human intervention.

## Variants

- **Pick up after a specific PR:** change the `SELECT NEXT UNIT` paragraph to "Start PR {N} unit 1.1 regardless of the ledger" when you explicitly want to jump.
- **Review-only mode:** prepend "Do NOT make code changes. Run the 5-axis self-review per `agent-skills:code-review-and-quality` against the current branch's diff, and the `compound-engineering:ce-review` pipeline. Additionally dispatch `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:maintainability-reviewer`, `compound-engineering:review:testing-reviewer`, and `compound-engineering:review:project-standards-reviewer` as persona subagents."
- **Rollback mode:** prepend "Run `fulcrum memory rollback --to v2` per PR 6 unit 6.6 documentation and verify the rollback SQL restores a pre-migration snapshot. Skills: `compound-engineering:review:data-migration-expert`, `compound-engineering:review:deployment-verification-agent`, `compound-engineering:ce-debug` for any anomalies."
- **Security audit mode:** prepend "Do NOT make code changes. Dispatch `agent-skills:security-auditor` (subagent) over the current branch's diff, then `compound-engineering:review:security-reviewer` over any files touching auth / public endpoints / untrusted input / permissions. Summarize findings with severity (critical / high / medium / low) and attack scenarios."
- **Performance audit mode:** prepend "Dispatch `compound-engineering:review:performance-reviewer` over all files touched by the current PR; then `agent-skills:performance-optimization` to propose measured improvements against named budgets (curator latency p95, graph traversal 100ms, decay pass <10s over 10k pages)."
- **Eval-only mode:** prepend "Run `fulcrum memory eval` against the retrieval corpus and report per-metric pass/fail. Skills: `compound-engineering:ce-optimize` if any metric falls below target."
