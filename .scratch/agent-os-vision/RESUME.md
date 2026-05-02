# Fulcrum Agent-OS — Resume / Execute Prompt

You (Claude or Codex) are the orchestrator. The user invoked you by `@`-referencing
this file with no other arguments. That invocation means RESUME AND KEEP GOING
NOW. It is explicit authorization to detect state, report a short digest, then
continue work without waiting for another user message.

Your job is to drive every issue to completion under strict TDD as one continuous
dependency queue. Target maximum implementation capacity is 12 concurrent
workers whenever dependencies allow: 6 Claude Code implementers + 6 Codex CLI
implementers. Opposite-runtime review is required at milestone / integration
gates, not after every individual issue. Gate review capacity is also per
runtime: up to 6 Codex reviewers and up to 6 Claude reviewers when a gate is
large enough to split safely. Claude-implemented work in a gate MUST be reviewed
by Codex before that gate is approved; Codex-implemented work in a gate MUST be
reviewed by Claude. Accept interruptions: every step must persist state to disk
so resuming again is idempotent. Maximize parallelization, use cross-team agents
for implementation and gate review, and do not stop unless: the user explicitly
says pause/stop; every issue is complete; HITL feedback is required and blocks
every remaining dispatchable path; or repo state is unsafe / ambiguous enough
that proceeding risks data loss. Status reporting, queue choice, ordinary review
debt, or passing/failing verification are not stop conditions.
Only before you begin you can always use grill-with-docs to resolve any gray areas so we start focused. Questions to me are always to utilize interactive wizards and recommendations not free text responses, and document and gray areas as open questions and answers as decisions so we prserve both so in the future we d not face similar ambegiouty 

Read this entire file before you act. Do not skip sections.

---

## Linkage chain (memorize, cite in every subagent prompt you dispatch)

Every artifact in this project links upward:

```
ISSUES (.scratch/agent-os-vision/<NN>-<slug>/issues/<NN>-<slug>.md)
  ↓
PRDs (.scratch/agent-os-vision/prds/<NN>-<slug>.md)
  ↓
REQUIREMENTS (.scratch/agent-os-vision/REQUIREMENTS.md, per-pillar sections)
  ↓
DECISIONS (.scratch/agent-os-vision/DECISIONS.md, locked Q-IDs + C1–C5 + auto-locks)
  ↓
VISION (.scratch/agent-os-vision/VISION-GAPS.md, user verbatim ask + clarifications)
```

Every issue's frontmatter declares `PRD:`, `Requirements:`, `Decisions:`,
`Vision:`, `Docs:` exactly so subagents do not have to re-derive context.

The execution plan is a continuous dependency-lane plan with critical path +
risk register in `.scratch/agent-os-vision/MASTER-PLAN.md`. Old milestone
labels are historical context only; they must never stop otherwise-dispatchable
work.

The proof that every clause of the user's ask traces to a specific PRD +
issue lives in `.scratch/agent-os-vision/COVERAGE.md` (current sign-off:
PASS).

You MUST cite this linkage chain to every subagent you dispatch. They
should never have to re-discover what a feature is for.

---

## Foundational constraints (apply to every dispatch you make)

From `DECISIONS.md`:

- **C1.** Online features SHIPPED but DISABLED by default behind feature
  flags. No "MVP / phase 2 / later" framing. Every gated feature still
  gets implementation + tests + docs.
- **C2.** Local-first default; SaaS schema-ready from day 1. Every
  tenant-scoped table has `org_id` + composite `(org_id, ...)` indexes.
- **C3.** Research → recommend → plan → grill → execute, every domain.
- **C4.** Three surfaces — Web+APIs primary, full CLI, full TUI — all
  shipped at feature parity per pillar before that pillar is "done".
- **C5.** "Out of scope" framing is BANNED for any feature ever
  mentioned in the user's ask, OPEN-QUESTIONS, research, or DECISIONS.
  Anything mentioned must be either in `## Always-on features` or
  `## Gated features` with a `FULCRUM_FEATURES=<flag>` name.
- **D6.** Execution is one continuous dependency queue. Keep implementation slots
  filled until the finish line: target 6 active Claude Code implementers plus 6
  active Codex CLI implementers whenever enough independent dispatchable work
  exists. Review gates are milestone / integration gates: related implemented
  issues are reviewed together once surrounding work exists and verification can
  be meaningful. Gate review can also use up to 6 reviewers per runtime when the
  bundle can be split safely. Claude-implemented work in a gate requires Codex
  review; Codex-implemented work in a gate requires Claude review. No same-runtime
  final approval for a gate.

If a subagent's work output violates any C1–C5 or D6, reject it and re-dispatch.

---

## Step 0 — Detect state

Run these checks in parallel (one Bash call per check):

1. `git -C /Users/mkh/workspace/fulcrum status --short` — uncommitted changes?
2. `git -C /Users/mkh/workspace/fulcrum log --oneline -5` — most recent commits.
3. `git -C /Users/mkh/workspace/fulcrum branch --show-current` — current branch
   (expected: `plan/agent-os-vision` or feature branch off it).
4. `find /Users/mkh/workspace/fulcrum/.scratch/agent-os-vision -name "*.md" | wc -l`
   — should be ≥ 360.
5. For each pillar `01-foundation-reset` through `17-cross-cutting-platform`,
   read the `issues/` directory, parse each issue's frontmatter, and bucket by:
   - `Status: ready-for-agent` (not started)
   - `Status: in-progress` (already claimed by a prior dispatch)
   - `Status: implemented` (code done; focused TDD green; queued for next gate)
   - `Status: integration-review` (milestone / integration gate under review)
   - `Status: needs-review` (legacy alias for integration-review; normalize it)
   - `Status: completed` (done)
   - `Status: blocked-needs-info`, `Status: needs-human` (HITL or stuck)
6. Audit `EXECUTION-LOG.md` and recent commits for review provenance. Any
   completed issue without explicit opposite-runtime milestone / integration
   gate approval is review debt: move it to `Status: implemented` and include it
   in the next appropriate gate before claiming it completed.

Compute per-pillar completion percentage. Report a one-screen status digest
to the user before any dispatch.

If `bun run ci` from repo root passes, note that. If not, the highest
priority becomes "fix CI" in one debug slot while unrelated dispatchable issues
continue in other slots when safe.

---

## Step 1 — Maintain the continuous dispatch queue

For every `Status: ready-for-agent` issue across all pillars:

1. Resolve its `Blocked-by:` frontmatter to issue paths.
2. An issue is "dispatchable" iff every blocker is `Status: implemented` or
   `Status: completed`. If a blocker owns a frozen cross-pillar contract or a
   migration that downstream code depends on, prefer completing the current
   integration gate before dispatching high-risk downstream work.
3. Among dispatchable issues, prefer:
   - Critical-path blockers first.
   - Issues that unlock the most blocked downstream work.
   - The pillar with the lowest completion percentage when priority ties.
   - HITL spikes early enough that dependent work is not starved.
4. Fill every open implementation slot up to 12 total: 6 Claude Code + 6 Codex
   CLI. This is not a batch boundary: when any slot frees, immediately refill
   from the next dispatchable issue.
5. Underutilization rule: if fewer than 12 implementation workers are active and
   enough independent dispatchable issues exist, keep selecting and dispatching.
   Running fewer than capacity is allowed only when dependencies, overlapping
   file ownership, HITL blockers, CI/firebreak isolation, or runtime
   unavailability make extra workers unsafe. Record the reason in
   `EXECUTION-LOG.md`.
6. If fewer than 12 whole issues are independently dispatchable, split large
   issues only when their acceptance criteria naturally divide into disjoint
   write sets. Do not split shared migrations, router contracts, or tightly
   coupled UI/API flows just to fill a slot.
7. Parent session must not wait on subagents while capacity is open. It should
   either dispatch another independent lane, prepare the next gate, run
   verification, or resolve blockers.

For each chosen issue, decide:

- **Implementation runtime:** Claude subagent vs. Codex subagent. Maintain a
  real cross-team split; target 6 active workers per runtime. Never let one
  runtime implement a whole pool alone unless the other runtime is unavailable
  or no safe independent work remains for it, and log that exception.
- **Model + effort:** pick per task complexity. Heuristic:
  - Small mechanical (pure helper, schema migration, a single
    well-bounded test file) → `haiku` (Claude) or `gpt-5-codex` low
    effort.
  - Standard (single tRPC procedure end-to-end with web + cli + tui +
    tests) → `sonnet` (Claude) or `gpt-5-codex` medium effort.
  - Complex / multi-file / design-judgment (cross-pillar wiring,
    Symphony state machine, retriever tuning, Yjs collab) → `opus`
    (Claude) or `gpt-5-codex` high effort.
  - Architecture or schema-shape decisions that change cross-pillar
    contracts → use the interactive question path for that issue only; keep
    other independent queue slots moving.

---

## Step 2 — Dispatch model (continuous 6 Claude + 6 Codex impl + milestone review gates)

You follow `superpowers:subagent-driven-development` and
`fulcrum:subagent-orchestration` skills strictly.

Per chosen issue:

1. Mark the issue `Status: in-progress` + add an `Owner:` frontmatter line
   with your orchestrator name (`claude-orchestrator` or
   `codex-orchestrator`). Persist immediately so an interrupt + resume
   does not double-dispatch the same issue.
2. Decide implementer:
   - Fill Codex CLI and Claude Code lanes independently, up to 6 active
     implementers each.
   - Alternate runtimes only as a tie-breaker. Capacity target wins: if Codex has
     2/6 active and Claude has 6/6 active, dispatch Codex when a safe Codex lane
     exists.
   - If both runtimes are available and more than one implementation slot is
     open, dispatch at least one Claude implementer and at least one Codex
     implementer before waiting.
   - Record runtime in `EXECUTION-LOG.md` as `runtime: claude|codex`.
3. Dispatch open implementation slots in parallel.
   Each write implementer gets an isolated worktree or otherwise explicit
   disjoint file ownership. Do not put two write workers on the same files or
   tightly coupled contract unless one owns tests and one owns implementation by
   explicit design.
   Each implementer prompt MUST include the linkage-chain block from
   the top of this file PLUS:
   - The full body of the issue file.
   - The frontmatter linkage refs (PRD path, Requirements section,
     Decisions Q-IDs, Vision rows, Docs).
   - Foundational constraints C1–C5.
   - TDD discipline rules (RED command + first 5 lines of failure +
     GREEN command + pass count, captured in commit body).
   - "DO NOT touch out-of-scope files" warning citing the issue's
     `Pillar:` field.
   - Report-back template (STATUS DONE/BLOCKED/NEEDS-INFO + commit
     SHA + files touched + any decision flagged).

4. When an implementer reports DONE:
   - Verify focused RED/GREEN evidence and inspect `git status` + `git diff`.
   - Mark the issue `Status: implemented` + persist. Record implementer runtime,
     commit SHA, focused verification command, and intended gate in
     `EXECUTION-LOG.md`.
   - Do NOT dispatch per-task review. Individual review gates are too early for
     many issues because acceptance only becomes meaningful once surrounding
     task / UI / API / TUI work exists.
   - Refill the freed implementation slot immediately.
5. Run a milestone / integration review gate when any trigger fires:
   - A dependency milestone from `MASTER-PLAN.md` has all required issues
     `Status: implemented`.
   - A pillar slice has enough surrounding work to verify feature parity across
     Web + API + CLI + TUI.
   - A shared contract, migration, router surface, generated CLI surface, or
     feature-flag registry changed.
   - 12-24 related implemented issues have accumulated and form a coherent
     review bundle.
   - Before marking downstream high-risk work completed, final merge, or release.
   Do not run a gate solely because the first few tasks are implemented; review
   after a real milestone, integration seam, or enough surrounding behavior
   exists to verify acceptance criteria.
6. For each review gate:
   - Mark included issues `Status: integration-review` + persist.
   - Run focused bundle tests plus `bun run ci` when shared contracts,
     migrations, or cross-surface behavior changed.
   - Dispatch opposite-runtime reviewers for the bundle, not for each task.
     Use up to 6 Codex reviewers and up to 6 Claude reviewers when the gate
     can be split by pillar, surface, or file ownership. Same-runtime review is
     invalid. Orchestrator self-review is invalid.
   - Reviewer prompt MUST include: issue list, commit range, combined diff,
     acceptance criteria, and pre-computed verification outputs so sandbox
     false-negatives do not block review.
   - Reviewer reports SPEC: PASS|FAIL + QUALITY: APPROVED|CHANGES_REQUIRED for
     the gate.
7. If gate review = APPROVED from the opposite runtime: mark included issues
   `Status: completed`, record gate approval provenance in `EXECUTION-LOG.md`,
   and continue filling implementation slots.
8. If gate review = CHANGES_REQUIRED: reopen only affected issues to
   `Status: in-progress` or `Status: implemented`, dispatch fixes, and rerun the
   same gate until approved. Do not accept "close enough".

---

## Step 3 — Cross-pillar coordination items (frozen via PRD addendum)

Some contracts span pillars. When an issue touches one of these, the
implementer must propose any change as a PRD addendum first (no in-progress
code rewrite of frozen contracts). Frozen contracts (per
`MASTER-PLAN.md` § Cross-pillar coordination):

- `AppRouter` tRPC type stability (Pillar 1 + 13 + 14).
- Edge-type registry (Pillar 1 owns; Pillars 7/8/10 register).
- Event payload schemas registry (Pillar 1 owns; every pillar registers).
- Feature-flag registry (Pillar 1 table; every pillar registers flags).
- Doctor extension registration (Pillar 14 aggregates; every pillar
  contributes).
- Search indexer hooks (Pillar 11 owns the table; every entity-owning
  pillar provides an indexer).
- Keybinding registry (Pillar 14 owns; every surface consumes).
- Theme contract (Pillar 17 owns; Pillars 15 + 16 consume).

Subagents touching these MUST be told to write a PRD addendum first if
they think a change is needed.

---

## Step 4 — Persist progress on every step

Every action persists state so an interrupted run can resume. Specifically:

- Issue `Status:` flips happen via `Edit` tool BEFORE the dispatch tool
  call.
- Implementer commits include `Closes (issue): <issue-path>` so we can
  reconstruct progress from `git log` if frontmatter desync.
- A running tally of in-flight dispatches persists at
  `.scratch/agent-os-vision/EXECUTION-LOG.md` (append-only). Each entry:
  ```
  ## <timestamp> — <orchestrator>
  Capacity: claude_impl=<active>/6 codex_impl=<active>/6 claude_review=<active>/6 codex_review=<active>/6
  Queue fill: [issue-path-1, issue-path-2, …]
  Underfilled reason (if any): <dependencies|file-overlap|HITL|CI-firebreak|runtime-unavailable|none>
  Implementers: [agent-id-1: claude-sonnet, agent-id-2: codex-medium, …]
  Implemented queue: [issue-path: impl=claude sha=<sha> gate=<gate-id>, …]
  Gate reviewers: [gate=<gate-id>: codex-reviewer-for-claude-impls, claude-reviewer-for-codex-impls]
  Gate provenance: [gate=<gate-id>: issues=[...] review=opposite-runtime APPROVED@<sha>]
  Result: [issue-path: IMPLEMENTED@<sha>, issue-path: COMPLETED via <gate-id>, issue-path: BLOCKED reason: …]
  ```
- On resume: read EXECUTION-LOG.md tail to detect in-flight implementation,
  implemented-but-not-gated work, integration review debt, and blocked HITL
  items before filling queue slots (Step 1).

---

## Step 5 — Continuous loop until done

Continue Steps 1–4 until ALL 341 issues are `Status: completed` AND
`bun run ci` is green for every configured stage AND the COVERAGE.md sign-off
remains PASS.
Do not stop at old milestone boundaries, six-issue batch boundaries, or "good enough"
milestones. Only stop for user interruption, unresolved HITL that blocks every
remaining dispatchable path, or final completion.
Milestone / integration review gates are checkpoints inside the loop, not a
reason to end the turn.

When done:

1. Final dispatch: full-branch code-reviewer subagent (
   `superpowers:code-reviewer`) verifying the entire branch against
   COVERAGE.md.
2. If approved: merge `plan/agent-os-vision` → main using non-fast-forward
   merge with summary commit body listing pillar count + issue count +
   total commits.
3. Push main.
4. Tag release per VERSIONING.md cadence (locked in DECISIONS).

---

## Interrupt handling

If interrupted at any point:

- The next invocation of `@RESUME.md` reads the same artifacts in the
  same order.
- A bare `@RESUME.md` invocation is never a request for status-only. It always
  means continue the execution loop after the required short digest.
- Step 0 detects the in-flight in-progress issues from frontmatter +
  EXECUTION-LOG.md.
- Step 0 audits implemented / completed issues for missing milestone gate
  provenance and schedules the next coherent integration gate without starving
  implementation slots.
- Step 0 also counts active Claude Code and Codex CLI lanes. If either runtime
  is below 6 active implementation workers and independent work exists, Step 1
  fills that runtime before waiting for existing workers.
- Step 1 excludes any `Status: in-progress` issue whose `Owner:` is
  the SAME orchestrator and was claimed within the last 30 minutes
  (assumes it's still running). After 30 minutes of no commit/log
  update, the orchestrator re-dispatches with `--resume` to recover.
- `Status: implemented`, `Status: integration-review`, and legacy
  `Status: needs-review` issues never get skipped. They are grouped into the
  next coherent milestone / integration gate while implementation slots keep
  moving on non-blocked work.
- Underfilled capacity is treated as a defect in orchestration, not a normal
  resting state. Every digest must show `claude_impl=<n>/6 codex_impl=<n>/6`
  plus the reason for any open slot.
- No partial PR/commit must be left dangling. Implementer subagents
  always commit + log before reporting DONE.

---

## Per-subagent prompt template (use verbatim, fill placeholders)

```
You are a <implementer|gate reviewer> subagent for the Fulcrum Agent-OS
rebuild at /Users/mkh/workspace/fulcrum, branch <CURRENT_BRANCH>.

LINKAGE CHAIN (read in order, do NOT skip):
- VISION: .scratch/agent-os-vision/VISION-GAPS.md (rows: <ISSUE_VISION_REFS>)
- REQUIREMENTS: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar <N> section)
- DECISIONS: .scratch/agent-os-vision/DECISIONS.md (locks: <ISSUE_DECISIONS>)
- PRD: <ISSUE_PRD_PATH>
- ISSUE: <ISSUE_PATH>
- DOCS: <ISSUE_DOCS>

FOUNDATIONAL CONSTRAINTS (NEVER violate):
- C1 (build everything, gate online behind FULCRUM_FEATURES, default OFF)
- C2 (local-first + SaaS schema-ready, org_id + composite indexes)
- C3 (research-first, failure gates, 2nd/3rd fallbacks)
- C4 (three surfaces parity per pillar — web + CLI + TUI)
- C5 (no "out of scope" / "deferred" / "MVP" / "phase 2" framing)

TASK:
<implementer: paste the full body of the issue file>
<gate reviewer: paste gate id, included issue paths, issue acceptance criteria,
 commit range, combined diff, and pre-computed verification outputs>

TDD DISCIPLINE (implementer):
1. Write the failing test FIRST (RED). Capture the command + first 5
   lines of failure output. Paste into commit body.
2. Implement the minimum code to make it pass (GREEN). Capture command
   + pass count. Paste into commit body.
3. Refactor only after green. No new behaviors during refactor.
4. Commit on the current branch with subject:
   `<type>(<scope>): <subject>` (Conventional Commits).
   Body cites RED + GREEN + Closes (issue): <ISSUE_PATH>.
5. DO NOT push (orchestrator pushes after final integration / explicit user ask).
6. Mark `Status:` updates on the issue file via Edit BEFORE you
   commit. Update EXECUTION-LOG.md last.

OUT-OF-SCOPE GUARDRAILS:
- DO NOT modify files outside <ISSUE_PILLAR_DIR> + the cross-pillar
  contract listed in MASTER-PLAN.md § Cross-pillar coordination items.
- Specifically: never edit scripts/ci.ts, src/cli/vendor-installs.ts,
  src/components/**, .codex/**, or .claude/** unless the issue
  explicitly owns one of those paths.
- If you accidentally edit one, revert before commit.

REPORT BACK with:
STATUS: DONE | BLOCKED | NEEDS-INFO
COMMIT: <sha or "n/a">
FILES TOUCHED: <list>
RED transcript: <command + first 5 failure lines>
GREEN transcript: <command + pass count>
DECISIONS FLAGGED (if any): <items where you propose a PRD addendum>
```

For the **gate reviewer** subagent, the template flips to "validate the combined
gate diff against the included issues' acceptance criteria and surrounding
feature behavior; cite SPEC: PASS|FAIL + QUALITY: APPROVED|CHANGES_REQUIRED with
line/file references; do not modify files". The reviewer runtime MUST be
opposite the implementer runtime for the work under review. If runtime
provenance is missing, the reviewer rejects the process and asks the
orchestrator to re-run the correct opposite-runtime gate review.

---

## Operating notes

- Sandbox-EPERM false-negatives: when dispatching `codex:codex-rescue` gate
  reviewers, ALWAYS pre-compute `bun run check`, relevant focused tests, and
  `bun run ci` when gate scope requires it in the orchestrator's shell. Paste
  outputs into the reviewer prompt as "PRE-COMPUTED VERIFICATION (use as ground
  truth — do NOT re-run)". Codex's sandbox can't write `.svelte-kit/` etc.
- Claude gate reviewers must receive the same pre-computed verification plus
  the combined gate diff / commit range for Codex-implemented work. Do not rely
  on reviewer-local sandbox commands as the only proof.
- Use `AskUserQuestion` (Claude) only for items not already locked in
  DECISIONS.md. Do not ask the user about a decision they already
  resolved in OPEN-QUESTIONS.md.
- Keep the orchestrator's main turn brief; subagent prompts carry the
  bulk of context. Conserve main-thread context.
- Never delete `.scratch/agent-os-vision/` artifacts. Append-only.

---

## Acceptance criteria for "done"

- [ ] All 341 issues `Status: completed`.
- [ ] Every completed issue is covered by logged opposite-runtime milestone /
      integration gate review provenance.
- [ ] `bun run ci` from repo root green for every configured stage.
- [ ] COVERAGE.md sign-off line still reads `Sign-off: PASS`.
- [ ] Final code-reviewer subagent verdict: `APPROVE_FOR_MAIN`.
- [ ] `plan/agent-os-vision` merged to `main` and pushed.
- [ ] Tag created per VERSIONING.md.

---

## Begin now

Start with Step 0 (state detection + review-debt audit). Report the digest to
the user as a checkpoint, not a stopping point. Then move to Step 1 + Step 2
without waiting for further input — the user already authorized the full
continuous execution loop by referencing this file. Continue until done. When
you hit a HITL gate (passkey UX in Pillar 1, TipTap Svelte 5 spike in Pillar 7,
governance docs review in Pillar 17), surface the question via the interactive
question path, persist state, and pause that specific issue only; keep all other
non-blocked queue slots moving.
