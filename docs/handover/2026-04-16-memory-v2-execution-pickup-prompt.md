# Pickup Prompt — Fulcrum Memory v2 Autonomous Execution

**Purpose:** single-shot prompt that executes both v2a and v2b plans end-to-end, autonomously, with resume support across sessions. Paste the body below (everything between the `---PROMPT-START---` and `---PROMPT-END---` markers) into a new Claude Code session in `/home/mkh/workspace/pi-stack-plan/` to start or resume.

This file IS the prompt. Do not summarize it before pasting; paste it verbatim.

---PROMPT-START---

You are executing Fulcrum's Memory v2a + v2b plans end-to-end, autonomously, in a single continuous run. Resume from wherever the prior session left off. Do not ask me anything until both plans are fully complete and self-verified.

## Step 0 — Read these files in order, then proceed

1. `docs/handover/2026-04-16-memory-v2-execution-handover.md` — full context, gates, bootstrap rules
2. `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md` — authoritative v2a/v2b boundary
3. `docs/plans/2026-04-16-memory-v2a-plan.md` — v2a plan (53 tasks, 9 PRs + per-host cluster)
4. `docs/plans/2026-04-16-memory-v2b-plan.md` — v2b plan (50 tasks, 12 PRs)
5. `docs/plans/2026-04-16-memory-v2-cross-plan-review.md` — handoff invariants between plans
6. `docs/plans/2026-04-16-memory-v2a-plan-review.md` — v2a headless review (residual P1s)
7. `docs/plans/2026-04-16-memory-v2b-plan-review.md` — v2b headless review (residual P1s)
8. `docs/brainstorms/2026-04-16-memory-architecture-v2/index.md` — section numbering for §11.X / §12.X references

If `docs/handover/memory-v2-execution-progress.md` exists, read it last. It is the source of truth for resume state.

## Step 1 — Resume detection

Run these probes to detect where the prior session stopped:

```bash
# Last completed PR per progress log
test -f docs/handover/memory-v2-execution-progress.md && tail -50 docs/handover/memory-v2-execution-progress.md

# Existing per-PR branches
git branch -a | grep -E 'plan/memory-v2-pr[0-9]+' | sort

# Existing decisions / gate ADRs
ls docs/decisions/ 2>/dev/null

# Last 30 commits across the working tree
git log --oneline -30

# Current working tree state
git status --short
```

Three resume scenarios:

- **Fresh start:** progress log absent OR contains zero `Status: complete` entries. Begin at v2a PR 1.
- **Mid-run resume:** last entry has `Status: complete`. Resume at the PR named in `Next:`.
- **Interrupted PR resume:** last entry has `Status: in_progress` or `Status: blocked`. Investigate the PR's branch (`git checkout plan/memory-v2-prN; git log --oneline -20; git status`). Determine which tasks completed (commit messages); resume from the next uncompleted task. If `blocked`, re-attempt the blocker — do not assume it's still blocked.

Write a `## Resume detection — <ISO timestamp>` block at the top of the progress log noting what was detected and what PR you are resuming at.

## Step 2 — Apply gate defaults (autonomously)

Before touching any v2b PR that has a gate, ensure the gate's ADR exists. If it does not, create it with the documented default and proceed.

| Gate | ADR path | Default content if missing |
|---|---|---|
| Gate 1 — v2a bake | `docs/decisions/2026-04-16-v2a-bake-mode.md` | `BAKE_MODE=skip` (dev-mode default). Note: production deployments require `BAKE_MODE=wait` and a 2-week real-time soak between v2a merge and v2b PR 10. |
| Gate 2 — Identity | `docs/decisions/2026-04-16-identity-decision.md` | Title-wins-authority (memory-first framing kept; AGENTS.md updated to match). Use the title-wins phase ordering from v2b plan §"Open questions" #1. |
| Gate 3 — Dreaming thresholds | `docs/decisions/2026-04-16-dreaming-thresholds.md` | Run the §12.2 sweep on imported sessions if present (find under `~/.local/share/fulcrum/imports/sessions/` or equivalent). If sweep yields a promotion rate, document it. If imports absent, default to manifest B.4 thresholds verbatim and note "thresholds applied unvalidated; user re-tune after first 2 weeks of v2b dogfood data." |
| Gate 4 — Fulcrum eval | `docs/decisions/2026-04-16-fulcrum-eval-design.md` | Design code-change-memory eval per v2b plan §Phase 5; corpus seeded from v2a's `memory_recall_events` ledger after v2a ships. |
| Gate 5 — Copilot request | `docs/decisions/2026-04-16-copilot-request.md` | DEFER PR 18 — no user request captured. Document deferral; pickup prompt skips PR 18 and notes it in the final report. |

Use `agent-skills:documentation-and-adrs` for each ADR. Each ADR includes: context, decision, consequences, override path (how the user can revisit later).

## Step 3 — Per-task workflow (the contract)

Follow the Standard Task Workflow from each plan's §"Standard Task Workflow" section. Summarized:

**Non-bootstrap tasks (default):**
1. `mcp__fulcrum__build_cos_context` + `mcp__fulcrum__get_workspace_status` + `mcp__fulcrum__recall_memory` query the task's topic
2. `agent-skills:context-engineering` to load relevant files
3. `agent-skills:source-driven-development` + `find-docs <library>` for any external API
4. `mcp__fulcrum__start_agent_run` with `agent_role`, `task_id`, `context_type='primary'`
5. `agent-skills:test-driven-development` — failing test first
6. `agent-skills:incremental-implementation` — thinnest impl that passes
7. `mcp__fulcrum__heartbeat_agent_run` every ~30s during long work
8. `agent-skills:build` + the task's exact `Verify:` command (must pass)
9. `agent-skills:review` — 5-axis self-review
10. Atomic commit on the PR branch (use `compound-engineering:git-commit`)
11. `mcp__fulcrum__complete_agent_run` with `output_summary` + `artifact_paths`
12. `mcp__fulcrum__write_memory` for any non-obvious decision (`kind='decision'`, tags include `['v2a', 'pr-N']` or `['v2b', 'pr-N']`)

**Bootstrap-mode tasks (v2a PRs 1, 2, 5, 6 + v2b PR 21):**
- Skip steps 1, 4, 7, 11, 12 above (the `mcp__fulcrum__*` calls).
- Replace step 12 with: append a markdown note to `docs/decisions/<topic>.md` for any non-obvious decision.
- Replace step 4's lifecycle tracking with: built-in `TaskCreate` (Claude Code task tool) for the task; mark `TaskUpdate status=in_progress` at start and `status=completed` at end.
- All other steps (`agent-skills:*`, `compound-engineering:*`, `find-docs`, `git`, `Bash`, `Read`/`Edit`/`Write`/`Grep`) stay on.

## Step 4 — Per-PR workflow

For each PR (in plan order: v2a PR 1 → … → v2a per-host cluster → v2b PR 10 → … → v2b PR 21):

1. **Open branch:** `git switch -c plan/memory-v2-pr<N>` (or resume existing branch with `git checkout plan/memory-v2-pr<N>`).
2. **Bootstrap entry checkpoint** (if PR is bootstrap): write `mcp__fulcrum__get_workspace_status` JSON + `mcp__fulcrum__list_tasks` JSON snapshots to `docs/decisions/2026-04-16-pr-<N>-bootstrap-entry.json` BEFORE the first task.
3. **Work the task list** in order (every task in the PR's Phase section). Per-task workflow above.
4. **Run all `Verify:` commands** on a clean checkout: `pnpm install && pnpm -r build && pnpm -r typecheck && pnpm -r test`. Plus each task's individual `Verify:` line.
5. **Quality gates per the plan's "Per-PR Quality Gates" §"Always-on gates"** — every checkbox must pass.
6. **Conditional gates** per the same section's table — apply if PR matches a trigger (security PR, schema/migration, monitor/dashboard, retrieval, new external library, CI, new public interface).
7. **`agent-skills:code-review-and-quality`** + `compound-engineering:ce-review` tiered persona pass on the diff.
8. **`compound-engineering:ce-pr-description`** to draft the PR body.
9. **Commit + push:** `compound-engineering:git-commit-push-pr` (or `compound-engineering:git-commit` then manual `git push -u origin plan/memory-v2-pr<N>`). Do NOT merge to `main` — the user explicitly approves merges.
10. **Bootstrap exit checkpoint** (if PR is bootstrap): smoke-test `mcp__fulcrum__write_memory` + `recall_memory` + `start_agent_run` + `complete_agent_run` round-trips. Failure here is a release blocker — record in progress log as `Status: blocked` and STOP.
11. **Append progress log entry** (see Step 5).
12. **Move to next PR without stopping.**

## Step 5 — Progress log entry (append after every PR)

Append to `docs/handover/memory-v2-execution-progress.md`:

```
## PR <N> — <title>
- Status: complete | in_progress | blocked
- Branch: plan/memory-v2-pr<N>
- Commits: <first sha>..<last sha>
- Verify results: <PASS / FAIL summary; if FAIL, the failing command + output excerpt>
- Bootstrap mode: ON | OFF
- Tasks completed: <comma-separated task IDs from the plan>
- Defers / deviations: <any plan task skipped + reason; "none" if none>
- ADRs created: <list of docs/decisions/*.md files added by this PR>
- Next: PR <N+1> — <title>  |  v2b Phase 1 (PR 10)  |  COMPLETE (no more PRs)
- Timestamp: <ISO 8601>
```

## Step 6 — Error handling (the only times to stop and write `Status: blocked`)

Stop only for TRULY unresolvable blockers. The list below is exhaustive — anything else, fix and proceed.

- A `Verify:` test fails AND `agent-skills:debugging-and-error-recovery` (reproduce → localize → fix → guard) cannot resolve it after 3 distinct attempts.
- A library API has shifted such that `find-docs` confirms the upstream behavior is not what the plan task assumes, AND the workaround is non-trivial (>1 hour estimate).
- A bootstrap exit checkpoint smoke-test fails (the rebuilt path is broken).
- The build environment is unavailable (Kuzu cannot be installed; sqlite-vec missing; pnpm corrupted).
- A security finding from `security-review` skill is rated CRITICAL on a security PR.

When stopping, the progress log entry must include a clear `Blocker:` field describing what's wrong, what was tried, and what the user can decide to unblock.

When NOT to stop:
- Stylistic preferences (pick the plan's default).
- "Should I do X or Y" where the plan documents one — pick the plan's choice.
- Library version bumps (only bump if a failing test forces it; document in commit message).
- Adversarial edge cases the plan didn't enumerate (apply the closest plan pattern).

## Step 7 — Final report (only after BOTH plans complete OR a true blocker)

After v2b PR 21's exit smoke-test passes (or after Gate 5 deferral skips PR 18 and PRs 19–21 complete), write a final report appended to the progress log:

```
## EXECUTION COMPLETE — <ISO timestamp>

### Summary
- v2a PRs landed: <list with branch + commit-range>
- v2a per-host cluster: <list>
- v2b PRs landed: <list with branch + commit-range>
- v2b PRs deferred: <list with reason — expect PR 18 if Gate 5 default applied>
- Total commits across both plans: <count>
- Total wall-clock duration: <hours>

### ADRs created
- <list of docs/decisions/*.md>

### Verify results table
| PR | Verify command | PASS/FAIL | Notes |
|---|---|---|---|
| ... | ... | ... | ... |

### Plan deviations
<any task skipped + reason; "none" if none>

### Workspace status snapshot
<output of `mcp__fulcrum__get_workspace_status` at completion>

### Outstanding items needing user attention
- Gate 5 (Copilot) deferral — needs user request to unlock PR 18
- Any P1 review findings the plans deferred (list)
- Any non-blocking warnings from CI / lint / typecheck

### Ready for your review.
The plans are executed. No commits to `main` yet — every PR is on `plan/memory-v2-pr<N>` branches. Run `git branch -a | grep plan/memory-v2` to see them. Run `gh pr list` to see drafts. When you approve, instruct merge or commit-to-main.
```

THEN STOP. Do not proceed to anything else. Wait for user input.

## Hard rules (non-negotiable)

1. **Do not ask me questions mid-execution.** Apply documented defaults (Step 2) for gates; pick the plan's choice for any "X vs Y" question; pick the safer / more conservative option for anything not in the plan.
2. **Do not commit to `main`.** Only to `plan/memory-v2-pr<N>` working branches. The user explicitly approves merges.
3. **Do not skip `Verify:` commands.** Every task's verify line runs and passes before completion.
4. **Do not skip the bootstrap-mode exit smoke-test.** If `write_memory` / `recall_memory` round-trip fails post-PR-1, that's a regression — record `Status: blocked` and stop.
5. **Do not absorb new scope.** If during execution a task reveals scope creep (e.g., "this also needs X"), record in progress log as `Defers / deviations: scope-creep deferred — <description>` and proceed with the documented task only.
6. **Do not use `mcp__fulcrum__*` during bootstrap PRs.** Use the external substitutes per Step 3.
7. **Do not write `Status: complete` for a PR with failing `Verify:` results.** Either fix the failure or write `Status: blocked`.
8. **Do honor the 10 critical constraints** verbatim from the plan: global-only data, L0→L1→L2 order, full sha256, dormancy, CLI-first, write-side automation, context_type no-default, sanitize-before-WAL, monitor loopback, rollback operator-only.
9. **Do follow the plan's effort estimates as planning signal, not commitment.** A PR that takes longer than estimated is fine; just record the actual duration in the progress log.
10. **Do treat the progress log as the source of truth for resume.** Other artifacts (git, ADRs, branches) are corroborating evidence; the log is canonical.

## Skills + tools you should expect to use heavily

- `agent-skills:test-driven-development` — every task
- `agent-skills:incremental-implementation` — every task
- `agent-skills:source-driven-development` + `find-docs <library>` — every external API call (Kuzu, sqlite-vec, chokidar, fs.watch, xxhash-wasm, ONNX, MCP SDK, prior art patterns, prior art patterns, prior art patterns)
- `agent-skills:context-engineering` — at every Phase boundary
- `agent-skills:debugging-and-error-recovery` — on every test failure
- `agent-skills:security-and-hardening` + `security-review` — PR 5 entirely; PR 6 sanitize→WAL paths; v2b PR 12 global scope policy; v2b PR 19 Cypher allowlist
- `agent-skills:deprecation-and-migration` — v2a PR 1 schema rebuilds; v2a PR 6 hook rewrite; v2b PR 21 flag removal
- `agent-skills:performance-optimization` — v2a PR 2 retrieval; v2a PR 4 PCI throughput; v2b PR 11 Dreaming promotion-rate calibration; v2b PR 14 Fulcrum eval
- `agent-skills:browser-testing-with-devtools` + `compound-engineering:test-browser` — v2a PR 4 Task 23 monitor `/content-index`; v2b PR 19 monitor Graph tab
- `agent-skills:api-and-interface-design` — every new MCP tool / CLI action / plugin manifest
- `agent-skills:ci-cd-and-automation` — `FULCRUM_MEMORY_V2` flag wiring across CI; per-host correctness PR cluster CI updates
- `agent-skills:documentation-and-adrs` — every gate ADR; every architectural decision
- `agent-skills:code-review-and-quality` — every PR before merge
- `agent-skills:git-workflow-and-versioning` — atomic commits per task
- `compound-engineering:ce-review` — every PR
- `compound-engineering:document-review` — once on the final progress log before final report
- `compound-engineering:ce-debug` — on any hard bug
- `compound-engineering:git-commit` / `git-commit-push-pr` / `ce-pr-description` — every PR
- `superpowers-developing-for-claude-code:developing-claude-code-plugins` — v2b PR 17 Task 8.3 (Claude marketplace bundle)
- Built-in `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` — bootstrap-PR substitutes for `mcp__fulcrum__*` lifecycle calls
- Built-in `Bash` / `Read` / `Edit` / `Write` / `Grep` / `Glob` — always
- Third-party MCP `mcp__mcpmu__context7--*` / `mcp__mcpmu__exa--*` / `mcp__mcpmu__tavily--*` — for docs research where `find-docs` is insufficient
- `WebSearch` / `WebFetch` — for upstream library issue trackers / changelogs when source-verifying

## Begin now.

Run Step 0 (read all 8 files), then Step 1 (resume detection), then proceed to the appropriate PR. Write the resume detection block to the progress log first, then start working. Do not write me anything until Step 7's final report (or a Step 6 true blocker).

---PROMPT-END---

## How to use this file

**To start a fresh execution:**
1. Open a new Claude Code session in `/home/mkh/workspace/pi-stack-plan/`.
2. Paste everything between `---PROMPT-START---` and `---PROMPT-END---` (above) as a single user message.
3. Walk away. The agent runs to completion or to a true blocker.

**To resume an interrupted execution:**
1. Open a new Claude Code session in `/home/mkh/workspace/pi-stack-plan/`.
2. Paste the same prompt body verbatim. Resume detection in Step 1 reads `docs/handover/memory-v2-execution-progress.md` and continues from where the prior session stopped.
3. Walk away again.

**To check status mid-run (without interrupting):**
- `tail -100 docs/handover/memory-v2-execution-progress.md` — see what's done
- `git branch -a | grep plan/memory-v2` — see open branches
- `ls docs/decisions/` — see ADRs created

**To override gate defaults before resume:**
- Pre-write the corresponding ADR under `docs/decisions/` BEFORE pasting the prompt. Step 2 detects existing ADRs and uses them instead of the default.

**To stop a running execution:**
- Interrupt the session (Ctrl+C / close). The progress log will have the last completed PR. Resume later by re-pasting the prompt.

## Why one prompt instead of stage-gated prompts

The user explicitly requested single-shot autonomous execution to avoid context-switch overhead and per-stage approval friction. This prompt trades that approval surface for documented defaults + a final-report review. The user retains full override via pre-written ADRs.

The pickup prompt is **idempotent**: pasting it twice in a row produces the same result the second time (resume detection finds nothing new to do and goes straight to Step 7 final report — or, if work is in progress, picks up exactly where it left off).
