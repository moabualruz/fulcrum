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

SELECT NEXT UNIT
  - Open the progress ledger. Find the last entry. The next unit is the one
    immediately after it in the plan's phased PR order.
  - If the last entry's status is `in_progress`, that unit is yours to
    finish. Do NOT start a new one.
  - If the last entry is `blocked`, surface the blocker to the user and
    stop. Do not work around it.

INVOKE REQUIRED SKILLS (per the plan's §Skill Utilization Matrix)
  Cross-cutting (every unit, every time):
    - agent-skills:incremental-implementation
    - agent-skills:test-driven-development
    - agent-skills:code-review-and-quality
    - agent-skills:source-driven-development + find-docs (for every
      library API touched)
    - andrej-karpathy-skills:karpathy-guidelines
  Per-PR: look up the required skills in §Skill Utilization Matrix for the
  current PR and list them in the opening status message. If the required
  skill for this PR is codex:gpt-5-4-prompting (PR 3 curator work),
  invoke it BEFORE writing any prompt string.

EXECUTE THE UNIT
  - Bootstrap Mode (PRs 0, 3, 6) suppresses mcp__fulcrum__* calls per
    the plan. Use its substitutes.
  - Write the failing test first. Land the thinnest impl that passes.
  - No PR exceeds ~500 diff lines. If a unit would cross that bar,
    stop and split it.
  - Do NOT touch files outside the unit's stated scope. No orthogonal
    cleanup, no "while I'm here" refactors.

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
  - End of a PR (not just a unit) — hand off for review before the next PR.
  - Any Verify: gate fails twice after a root-cause fix attempt.
  - Any required skill is unavailable in the current session.
  - Schema migration encounters unexpected data in a dry-run.
  - 3 hours of wall-clock elapsed in the session.

BOUNDARIES (hard)
  - No feature creep. If a neighbouring bug is discovered, file it as a
    new issue; do NOT fix it in the current unit.
  - No destructive git operations (force-push, reset --hard, branch -D)
    without explicit user approval.
  - No removing the FULCRUM_MEMORY_V3 flag until PR 9 cleanup unit 9.5.
  - No merging PRs without the required reviewer subagents per
    §Subagent Delegation having signed off.

OPEN-QUESTIONS GUARD
  If a new ambiguity appears that is not already resolved in the plan's
  §Open Questions, stop and ask. Do not guess.
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
- **Review-only mode:** prepend "Do NOT make code changes. Run the 5-axis self-review per `agent-skills:code-review-and-quality` against the current branch's diff, and the `compound-engineering:ce-review` pipeline."
- **Rollback mode:** prepend "Run `fulcrum memory rollback --to v2` per PR 6 unit 6.6 documentation and verify the rollback SQL restores a pre-migration snapshot."
