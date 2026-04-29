## Patterns

### Parallel split rule

One agent = one responsibility.

Maximize useful parallelism after dependency analysis:

- Dispatch every independent lane that can run without blocking the parent or colliding on files.
- Keep dependency chains sequential only where a later unit needs concrete output from an earlier unit.
- Re-batch work after each result: new independent follow-ups should launch in parallel instead of waiting for the whole original wave.
- If a unit becomes blocked, split the unblocked remainder and dispatch it while the blocker is resolved.

Good development units:

- Behavior slice + related tests.
- Subsystem/refactor slice with clear ownership.
- Vendor/API research.
- Generated artifact or install-path verification.
- Review dimension: correctness, security, tests, docs drift.

Good non-development units:

- Independent research question.
- Source verification lane.
- Data extraction/cleaning lane.
- Outline/draft/review lane.
- Legal/policy/risk review lane.

### Worktree lanes

Use git worktrees for parallel write lanes.

Rules:

- Parent keeps the integration workspace and critical-path edits.
- Each implementation worker gets an isolated worktree plus disjoint file ownership.
- Review workers use a worktree when they may patch issues; read-only reviewers can inspect the integration workspace.
- Use external worktrees such as `~/.config/superpowers/worktrees/<project>/<lane>` when project-local `.worktrees/` is absent or not proven ignored.
- Seed uncommitted integration state into worker worktrees when the task depends on it, then integrate back by owned-path patch.
- After each merge-back: run `git status --short`, `git diff --stat`, focused tests, then update the dependency graph.

Do not use worktrees for one tiny parent edit or pure read-only research.

### Runtime scheduling

At each checkpoint, classify remaining work:

- Stay in parent session: immediate blocker, small edit, tightly coupled integration, or user-facing decision.
- Parallelize now: 2+ independent units with separate write sets or read-only research lanes.
- Sequential subagent: dependent migration, review-after-implementation, shared file ownership, or missing input from earlier work.
- Stop and ask: dependency or destructive operation cannot be resolved safely from repo context.

This assessment is runtime behavior. A plan can suggest waves, but the orchestrator must revise waves when tests, reviewers, or user direction change the graph.

### Development test setup

Before implementation dispatch, parent defines required tests or verification criteria when feasible.

Parent may:

- Write one/few focused tests directly.
- Define exact test cases and expected failures.
- Choose existing tests to extend.
- Identify no-code verification for docs/config/research tasks.

Do not create a separate test agent for one or two straightforward tests.

Consider test-focused agent only when:

- 3+ meaningful tests span files/layers.
- Fixture/setup design is nontrivial.
- Behavior is high-risk or ambiguous.
- Multiple test types are required.
- Independent test review prevents weak assertions or implementation gaming.

### Test strategy

Pick smallest test set that proves required behavior.

Common test types:

- Unit: isolated function/component logic.
- Component: UI/component behavior with dependencies stubbed.
- Integration: modules, database, service, filesystem, CLI, or API interaction.
- Contract: provider-consumer/schema compatibility.
- E2E/system: full user/system workflow.
- Regression: locks a previously failing bug.
- Snapshot/golden: stable output or generated artifact.
- Smoke: cheap "starts/runs basic path" check.
- Manual/exploratory: usability, visual judgment, or hard-to-automate risk.

Prefer lower-scope tests when they prove same behavior. Add higher-scope tests only for integration/workflow risk.

### Implementation dispatch

Dispatch implementation agents only after enough tests or verification criteria exist.

Assignment includes:

- Workspace/worktree/remote target and branch posture.
- Local steering to read first.
- Owned files/artifacts only.
- Tests or verification criteria for the unit.
- Command to run.
- Required skill calls.
- Code-doc alignment requirement.
- No unrelated refactors.
- No test modification unless explicitly assigned.
- No stubs/placeholders/deferred work.

Implementation agents must keep related code, tests, docs, examples, and generated artifacts aligned.

Model/effort selection belongs in the assignment:

- Mechanical lane: smaller model/low effort; exact edits, fixtures, formatting, focused tests.
- Integration lane: default model/medium effort; adapters, CLI surfaces, database/filesystem behavior.
- Judgment lane: stronger model/high effort; architecture, ambiguous requirements, broad refactors, security/auth/shell/network review.
- Final review lane: strongest available effort justified by blast radius and number of touched surfaces.

Check when relevant:

- README / usage docs.
- CLI help text.
- Config examples.
- API docs / generated docs.
- Changelog or release notes if project policy requires.
- Migration notes.
- Tests/evals/fixtures/snapshots.
- Install/uninstall docs.
- Troubleshooting docs.

Prefer updating existing docs. Do not create new docs unless task/project asks for it or no correct existing place exists.

### Review dispatch

Do not review-agent every tiny change.

Use parent review for:

- One small test.
- One-file/simple implementation.
- Low-risk docs/config change.

Use review agent for:

- Multi-file changes.
- 3+ tests or nontrivial fixtures.
- Security/data/auth/shell/network behavior.
- Generated/install artifacts.
- PR/MR review where separate comments matter.
- Code-doc alignment risk.

Reviewer behavior:

1. Read available steering relevant to review target.
2. Inspect actual files, artifacts, generated outputs, installed config, logs, and claimed paths.
3. Check `git status --short` and `git diff --stat`, but do not treat git as full truth.
4. Run focused verification for touched behavior when possible.
5. Verify code-doc alignment: names, defaults, paths, commands, flags, outputs, errors.
6. If writable local workspace: patch issues inside review scope.
7. If remote PR/MR with comment access: leave exact review comments and suggested patches.
8. If remote PR/MR with branch write access and policy permits: apply small safe fix commits.
9. If read-only: report exact file/path/line, issue, and required fix.
