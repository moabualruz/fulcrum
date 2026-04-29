## Invocation

Parent orchestrator:

1. Collect steering that exists: user request, ticket, issue, PR/MR, spec, design doc, logs, screenshots, traces, failing tests, acceptance criteria, repo guidance, project config, vendor/API docs.
2. Do not assume project-specific files exist.
3. Build dependency graph: critical path, parallel-safe units, shared-file risks, review gates.
4. Split by smallest independently completable unit.
5. Keep parent on critical path; do not idle while agents run unless blocked.
6. Assign each agent one responsibility, exact workspace, owned files/artifacts, required skill calls, verification evidence, and report schema.
7. Match model/effort to task complexity. Use smaller/equal models for mechanical work; stronger reasoning only for high-risk design/review.
8. Dispatch parallel agents only for genuinely independent units.

Every subagent starts by orienting inside assigned context:

1. Confirm assigned workspace/worktree/repo/remote target.
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
7. Report changed files/artifacts, commands run, pass/fail output, unresolved risks, and paths reviewer must inspect.

Parent accepts work only after:

1. Every subagent claim is checked against actual output.
2. Claimed files/artifacts/logs/config paths exist and match report.
3. Tests or verification criteria for each unit pass.
4. Reviewer issues are fixed or explicitly accepted by user.
5. Code, tests, docs, examples, and generated artifacts align.
6. Full project/task gate passes when available.

Never mark done because agent said done.
