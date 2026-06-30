## Invocation

### Parent Orchestrator

1. Collect steering: user request, ticket or issue, backlog, execution plan, tracker state, active PRs, branch state, failing tests, acceptance criteria, repo guidance, local rules, project config, and vendor docs when needed.
2. Reconcile the tracker before dispatch. Keep local issue rows fine-grained for scan, blocker, dispatch, verify, and follow-up evidence. Do not confuse row size with worker-lane size.
3. Build the dependency graph: critical path, generator/SDK barriers, runtime dependencies, merge dependencies, pointer-chain levels, high-risk review surfaces, shared test surfaces, and working-tree collisions.
4. Pack lanes before parallelizing:
   - Same owner path, checkout, target branch, and verification surface goes into one lane.
   - Include implementation, tests, docs, generated artifacts, fixtures, reviewer fixes, and follow-up cleanup for that owner.
   - Prefer one PR per coherent owner-path deliverable.
5. Split only with a recorded reason:
   - Different working tree or collision risk.
   - Generator, SDK, or contract barrier ordering.
   - High-risk isolation for auth, data migration, PHI/PII, secrets, destructive ops, or public API break risk.
   - Pointer-chain level. Pointer bumps stay separate and bottom-up.
   - Runtime, test environment, or merge dependency.
   - Explicit user instruction.
6. Choose execution mode per lane:
   - Parent session: immediate blocker, small integration edit, tightly coupled merge, or user-facing decision.
   - Parallel worker: right-sized independent lane where parent can keep doing useful non-overlapping work.
   - Sequential worker: blocked by prior result, review gate, migration order, pointer-chain level, shared write set, or missing input.
   - Read-only reviewer or scout: independent review, PR sweep, source verification, or risk analysis.
7. Increase agent count only after bundles are right-sized. More agents with tiny lanes repeats the failure mode.
8. Match model and effort to the lane, not the whole wave:
   - Low effort: mechanical edits, fixtures, formatting, narrow tests, log extraction.
   - Medium effort: normal feature bundle, adapters, focused debugging, repo pattern integration.
   - High effort: architecture, auth, data, public APIs, shell/network/security, final integration review.
9. Keep parent on the critical path while agents run: reconcile trackers, check PRs, prepare verification, merge completed lanes, or unblock another non-overlapping lane.
10. Reassess after every result, failure, reviewer finding, merge, or user instruction. Repack newly compatible follow-ups instead of opening drip-feed PRs.

## Lane Brief Schema

Give each worker:

- Workspace or worktree path.
- Bundle id, parent issue, and included child rows.
- Owned files or owner path.
- Explicit non-owned files.
- Required reads and required skills.
- Required verification commands.
- Evidence format with exact command output or artifact paths.
- PR expectation: one coherent PR unless a split reason is approved.

Tell every worker:

- You are not alone in the codebase. Do not revert or overwrite others' work.
- Execute the full assigned lane. No stubs, placeholders, or deferred implementation.
- Keep code, tests, docs, examples, and generated artifacts aligned.
- Ask for context when missing instead of guessing.
- Report changed files, commands run, pass/fail evidence, risks, blockers, and dependency assumptions.

## Worker Status Handling

- `DONE`: verify actual files, diffs, tests, and evidence before review or merge.
- `DONE_WITH_CONCERNS`: resolve correctness or scope concerns before accepting; note observations and continue.
- `NEEDS_CONTEXT`: provide the missing context, then continue the same lane.
- `BLOCKED`: classify the blocker. Provide context, raise effort, split the lane, fix the plan, or escalate the exact unblock ask. Do not retry unchanged.

## Review And Acceptance

Use parent review for tiny, low-risk parent edits. Use review agents for multi-file lanes, generated artifacts, auth/security/data/API/shell/network surfaces, prior review comments, or code-doc alignment risk.

Parent accepts a lane only after:

1. Worker claims match actual files and artifacts.
2. `git status`, diff, and generated outputs are inspected.
3. Focused verification passes at the exact owned path.
4. Reviewer findings are fixed or explicitly accepted.
5. Remote PR head matches the locally verified head.
6. Local issue rows have evidence and split reasons where needed.
7. Parent pointers and workspace pointers are handled bottom-up after submodule merges.

Never mark done because an agent said done.
