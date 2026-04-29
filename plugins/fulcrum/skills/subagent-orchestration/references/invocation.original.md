## Invocation

Parent orchestrator:

1. Collect steering that exists: user request, ticket, issue, PR/MR, spec, design doc, logs, screenshots, traces, failing tests, acceptance criteria, repo guidance, project config, vendor/API docs.
2. Do not assume project-specific files exist.
3. Build dependency graph: critical path, dependency chains, parallel-safe units, shared-file risks, review gates.
4. Split by smallest independently completable unit, then maximize useful parallelism across units whose inputs and write sets do not overlap.
5. Choose execution mode per unit at runtime:
   - Parent session: immediate critical-path work, tiny edits, or work too coupled to brief safely.
   - Parallel subagent: independent unit where parent can keep doing non-overlapping work.
   - Sequential subagent: unit blocked by a prior result, review gate, migration order, or shared write set.
6. Reassess scheduling after every result, failure, reviewer finding, or new user instruction; do not stay bound to the initial plan when runtime evidence changes the dependency graph.
7. Use isolated git worktrees for parallel implementation or review lanes with writes. Prefer a global worktree root such as `~/.config/superpowers/worktrees/<project>/` when project-local worktrees are not already ignored. Read-only research lanes may share the main worktree if they will not write.
8. Keep parent on critical path; do not idle while agents run unless blocked.
9. Assign each agent one responsibility, exact workspace/worktree, owned files/artifacts, required skill calls, verification evidence, and report schema.
10. Match model and effort to assigned work, not to the overall project:
    - Low effort/smaller model: mechanical edits, fixture updates, formatting, narrow tests, log extraction.
    - Medium effort/default model: normal feature slices, adapter work, focused debugging, integration of known patterns.
    - High or xhigh effort/stronger model: architecture, ambiguous requirements, cross-cutting refactors, security/auth/shell/network review, final integration review.
11. Dispatch parallel agents whenever 2+ genuinely independent units exist and worktree/ownership boundaries are clear. Do not dispatch only because agents are available.

Every subagent starts by orienting inside assigned context:

1. Confirm assigned workspace/worktree/repo/remote target and branch posture.
2. Read available steering relevant to its task:
   - agent guidance files if present: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `GEMINI.md`
   - user-provided spec/ticket/handover if present
   - README/CONTRIBUTING/project config if relevant
   - logs/artifacts/repro data if relevant
   - vendor/API docs if task depends on external behavior
3. Invoke required skills named in assignment.
4. Restate ownership boundary and deliverable.
5. Execute full assigned unit. No stubs, placeholders, or deferred implementation.
6. Verify assigned unit with task-appropriate evidence.
7. Report changed files/artifacts, commands run, pass/fail output, unresolved risks, dependency assumptions, and paths reviewer must inspect.

Parent accepts work only after:

1. Every subagent claim is checked against actual output.
2. Claimed files/artifacts/logs/config paths exist and match report.
3. Tests or verification criteria for each unit pass.
4. Reviewer issues are fixed or explicitly accepted by user.
5. Code, tests, docs, examples, and generated artifacts align.
6. Full project/task gate passes when available.
7. Integration workspace status and diff are checked after merging worker output from worktrees.

Never mark done because agent said done.
