## Patterns

### Macro Split Rule

One agent owns one coherent responsibility. A responsibility can include many local issue rows when they share owner path, checkout, branch, and verification surface.

Maximize useful parallelism after packing:

- Dispatch every right-sized lane that is independent and collision-free.
- Keep dependency chains sequential only where later work needs earlier output.
- Re-batch after each result. Fold compatible follow-ups into active lanes instead of creating tiny PRs.
- If a lane is blocked, split the unblocked remainder only when the split reason is recorded.

### Good Macro Lanes

- One service or package owner path with all current blockers, tests, docs, and generated artifacts.
- One generator or SDK barrier lane that fixes the shared owner and regenerates affected outputs.
- One frontend app family lane when apps share the same emitted pattern and verification command.
- One review-fix lane that handles all non-conflicting reviewer findings in the same PR.
- One read-only scout lane covering all open PRs for a repo while implementation continues elsewhere.
- One final integration lane that verifies status, diff, tests, tracker evidence, and parent pointers after several workers finish.

### Bad Macro Lanes

- One PR per typo, one PR per review nit, or one PR per local child issue.
- More agents added before owner-path bundles are formed.
- A worker dispatched with "look around" instead of a bundle id, owner path, and verification surface.
- Parallel workers in the same checkout without isolated worktrees.
- Pointer bump mixed with substantive code.
- Implementation, tests, docs, and generated artifacts split into separate PRs for the same owner without a dependency reason.

### Worktree Lanes

Use isolated git worktrees for parallel write lanes unless the repo already provides isolated submodule checkouts. Read-only scouts may share an integration workspace.

Rules:

- Parent keeps the integration workspace and critical-path edits.
- Each write worker gets disjoint owned paths or an isolated worktree.
- Review workers use a worktree when they may patch issues.
- Do not run two write workers in the same mutable checkout.
- After each merge-back, run status, diff, focused tests, then update tracker evidence.

### Runtime Scheduling

At every checkpoint:

- Stay local for immediate blockers, small integration edits, tight coupling, or user decisions.
- Parallelize right-sized independent lane bundles with separate write sets.
- Use sequential workers for migrations, review-after-implementation, pointer chains, shared files, or missing inputs.
- Stop and ask only when auth, destructive action, or a decision cannot be resolved from context.

### Test Strategy

Pick the smallest verification set that proves the bundled lane:

- Unit for isolated logic.
- Integration for database, service, filesystem, CLI, or API interaction.
- Contract for provider-consumer or schema compatibility.
- Snapshot or golden for generated artifacts.
- Smoke for cheap start/run proof.
- E2E only when workflow risk requires it.

Do not spawn a separate test agent for one obvious test. Use a test-focused agent only when fixtures span files or layers, multiple test types are required, or independent test review prevents weak assertions.

### Review Strategy

Review after each meaningful lane, not after every tiny row.

Use review agents for:

- Multi-file or generated output lanes.
- Security, auth, data, public API, shell, network, or migration risk.
- 3+ tests, nontrivial fixtures, or code-doc alignment risk.
- PRs with previous unresolved comments.

Reviewers inspect actual files, generated outputs, logs, status, diff, and focused verification. They do not accept summaries as proof.

### Repacking Test

Before dispatch, ask:

1. Does this lane include all same-owner compatible work currently known?
2. Would another agent immediately need the same checkout or verification surface?
3. Is a tiny lane justified by a split reason?
4. Will the resulting PR be meaningful to review and merge?

If any answer fails, repack before spawning.
