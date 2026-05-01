# Fulcrum Agent-OS — Resume / Execute Prompt

You (Claude or Codex) are the orchestrator. The user invoked you by `@`-referencing
this file with no other arguments. Your job is to detect current state, plan the
remaining work, and drive every issue to completion under strict TDD with
maximum 6 parallel subagents and cross-team review (Claude impl ↔ Codex review,
Codex impl ↔ Claude review). Accept interruptions: every step must persist
state to disk so resuming again is idempotent.

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

The execution plan that orders pillars/issues into 6 waves with critical
path + risk register lives in `.scratch/agent-os-vision/MASTER-PLAN.md`.

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

If a subagent's work output violates any C1–C5, reject it and re-dispatch.

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
   - `Status: completed` (done)
   - `Status: blocked-needs-info`, `Status: needs-human` (HITL or stuck)

Compute per-pillar completion percentage. Report a one-screen status digest
to the user before any dispatch.

If `bun run ci` from repo root passes, note that. If not, the highest
priority becomes "fix CI before resuming pillar work".

---

## Step 1 — Compute the next 6 dispatchable issues

For every `Status: ready-for-agent` issue across all pillars:

1. Resolve its `Blocked-by:` frontmatter to issue paths.
2. An issue is "dispatchable" iff every blocker is `Status: completed`.
3. Among dispatchable issues, prefer the order from `MASTER-PLAN.md`'s
   wave layout: Wave 1 issues before Wave 2 etc. Within a wave, prefer
   the pillar with the lowest current completion percentage so progress
   is balanced.
4. Pick at most **6** issues. The 6 chosen issues become the parallel
   batch.

For each chosen issue, decide:

- **Implementation surface:** Claude subagent vs. Codex subagent (alternate
  to keep the cross-review loop balanced — see Step 2).
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
    contracts → STOP and `AskUserQuestion` first; do not dispatch yet.

---

## Step 2 — Dispatch model (max 6 parallel + cross-review loops)

You follow `superpowers:subagent-driven-development` and
`fulcrum:subagent-orchestration` skills strictly.

Per chosen issue:

1. Mark the issue `Status: in-progress` + add an `Owner:` frontmatter line
   with your orchestrator name (`claude-orchestrator` or
   `codex-orchestrator`). Persist immediately so an interrupt + resume
   does not double-dispatch the same issue.
2. Decide implementer:
   - If the issue's even-indexed in the batch → Claude implementer
     (general-purpose subagent).
   - If odd-indexed → Codex implementer (codex:codex-rescue subagent).
   - This 50/50 split keeps the review loop balanced.
3. Dispatch the implementer in parallel (one tool block, all 6 calls).
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
   - Mark the issue `Status: needs-review` + persist.
   - Dispatch the **opposite** review subagent: Claude implementer →
     Codex review; Codex implementer → Claude review.
   - The reviewer prompt MUST include: pre-computed verification
     outputs (`bun run check`, the relevant `bun test` command output)
     so the reviewer doesn't hit sandbox EPERM false-negatives.
   - The reviewer reports SPEC: PASS|FAIL + QUALITY: APPROVED|
     CHANGES_REQUIRED.
5. If review = APPROVED: mark `Status: completed` + commit if not
   already + move on.
6. If review = CHANGES_REQUIRED: dispatch the SAME implementer subagent
   with the reviewer's findings. Loop until approved. Don't accept
   "close enough".

7. After every batch of 6 completions, run `bun run ci` from repo root.
   If it fails, dispatch a debug subagent to find + fix; pause new batches
   until CI is green.

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
  Batch: [issue-path-1, issue-path-2, …]
  Implementers: [agent-id-1: claude-sonnet, agent-id-2: codex-medium, …]
  Reviewers (when dispatched): [agent-id-3: codex-low, …]
  Result: [issue-path: COMPLETED@<sha>, issue-path: BLOCKED reason: …]
  ```
- On resume: read EXECUTION-LOG.md tail to detect any in-flight batches
  before computing the next batch (Step 1).

---

## Step 5 — Loop until done

Continue Steps 1–4 until ALL 341 issues are `Status: completed` AND
`bun run ci` is 9/9 green AND the COVERAGE.md sign-off remains PASS.

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
- Step 0 detects the in-flight in-progress issues from frontmatter +
  EXECUTION-LOG.md.
- Step 1 excludes any `Status: in-progress` issue whose `Owner:` is
  the SAME orchestrator and was claimed within the last 30 minutes
  (assumes it's still running). After 30 minutes of no commit/log
  update, the orchestrator re-dispatches with `--resume` to recover.
- No partial PR/commit must be left dangling. Implementer subagents
  always commit + log before reporting DONE.

---

## Per-subagent prompt template (use verbatim, fill placeholders)

```
You are a <implementer|reviewer> subagent for the Fulcrum Agent-OS
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
<reviewer: paste pre-computed verification outputs (bun run check, bun
 test -- <relevant-files>) AND the diff: git show <sha>>

TDD DISCIPLINE (implementer):
1. Write the failing test FIRST (RED). Capture the command + first 5
   lines of failure output. Paste into commit body.
2. Implement the minimum code to make it pass (GREEN). Capture command
   + pass count. Paste into commit body.
3. Refactor only after green. No new behaviors during refactor.
4. Commit on the current branch with subject:
   `<type>(<scope>): <subject>` (Conventional Commits).
   Body cites RED + GREEN + Closes (issue): <ISSUE_PATH>.
5. DO NOT push (orchestrator pushes after batch closes).
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

For the **reviewer** subagent, the template flips to "validate the diff
matches the issue's acceptance criteria; cite SPEC: PASS|FAIL + QUALITY:
APPROVED|CHANGES_REQUIRED with line/file references; do not modify
files".

---

## Operating notes

- Sandbox-EPERM false-negatives: when dispatching `codex:codex-rescue`
  reviewers, ALWAYS pre-compute `bun run check` and the relevant `bun
  test` outputs in the orchestrator's shell and paste them into the
  reviewer's prompt as "PRE-COMPUTED VERIFICATION (use as ground truth
  — do NOT re-run)". Codex's sandbox can't write `.svelte-kit/` etc.
- Use `AskUserQuestion` (Claude) only for items not already locked in
  DECISIONS.md. Do not ask the user about a decision they already
  resolved in OPEN-QUESTIONS.md.
- Keep the orchestrator's main turn brief; subagent prompts carry the
  bulk of context. Conserve main-thread context.
- Never delete `.scratch/agent-os-vision/` artifacts. Append-only.

---

## Acceptance criteria for "done"

- [ ] All 341 issues `Status: completed`.
- [ ] `bun run ci` from repo root: 9/9 (or higher per Pillar 14 cli stage)
      green.
- [ ] COVERAGE.md sign-off line still reads `Sign-off: PASS`.
- [ ] Final code-reviewer subagent verdict: `APPROVE_FOR_MAIN`.
- [ ] `plan/agent-os-vision` merged to `main` and pushed.
- [ ] Tag created per VERSIONING.md.

---

## Begin now

Start with Step 0 (state detection). Report the digest to the user.
Then move to Step 1 + Step 2 without waiting for further input — the
user already authorized the full execution loop by referencing this
file. Continue until done OR until you encounter a HITL gate (passkey
UX in Pillar 1, TipTap Svelte 5 spike in Pillar 7, governance docs
review in Pillar 17). When you hit a HITL gate, surface the question
to the user via `AskUserQuestion`, persist state, and pause that
specific issue until the user answers — but keep dispatching other
non-blocked issues in parallel.
